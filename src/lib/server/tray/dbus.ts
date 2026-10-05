import net from "node:net";

/**
 * Values map to JavaScript as follows: integers to numbers (64-bit ones to
 * bigints), structs and dict entries to arrays of their fields, arrays to
 * arrays, and variants to `Variant` objects.
 */
export type Variant = { signature: string; value: unknown };

export type MethodReturn = { signature: string; body: unknown[] };

/**
 * An object with one interface. The connection answers the standard
 * Properties, Introspectable and Peer interfaces for it.
 */
export type DBusObject = {
  interface: string;
  properties: Record<string, Variant>;
  methods: Record<string, (body: unknown[]) => MethodReturn>;
};

/** A method handler throws this to reply with a D-Bus error. */
export class DBusError extends Error {
  constructor({ name, message }: { name: string; message: string }) {
    super(message);
    this.name = name;
  }
}

type Message = {
  type: number;
  flags: number;
  serial: number;
  path?: string;
  interface?: string;
  member?: string;
  errorName?: string;
  replySerial?: number;
  destination?: string;
  sender?: string;
  signature: string;
  body: unknown[];
};

const MESSAGE_TYPE = { call: 1, return: 2, error: 3, signal: 4 } as const;
const NO_REPLY_EXPECTED = 0x1;

// The header field codes, in the order of `Message`'s fields they fill.
const HEADER_FIELDS = [
  { code: 1, key: "path", signature: "o" },
  { code: 2, key: "interface", signature: "s" },
  { code: 3, key: "member", signature: "s" },
  { code: 4, key: "errorName", signature: "s" },
  { code: 5, key: "replySerial", signature: "u" },
  { code: 6, key: "destination", signature: "s" },
  { code: 7, key: "sender", signature: "s" },
  { code: 8, key: "signature", signature: "g" },
] as const;

/**
 * The subset of D-Bus that the tray needs: a session bus connection with
 * EXTERNAL authentication, method calls, exported objects that answer the
 * standard interfaces, watching a name, and marshalling of every type
 * in little-endian.
 * https://dbus.freedesktop.org/doc/dbus-specification.html
 *
 * The connection keeps the serial of the last message it
 * sent, the calls waiting for a reply, the objects it answers calls on, the
 * signal listeners, and the received bytes that do not yet form a message.
 */
export class DBusConnection {
  private readonly socket: net.Socket;
  private serial = 0;
  private readonly pendingCalls = new Map<
    number,
    { resolve: (body: unknown[]) => void; reject: (error: Error) => void }
  >();
  private readonly objects = new Map<string, DBusObject>();
  private readonly signalListeners = new Set<(message: Message) => void>();
  private received = Buffer.alloc(0);
  private uniqueName = "";

  /** Connect to the session bus, authenticate, and take a unique name. */
  static async create(): Promise<DBusConnection> {
    const socket = net.connect(getSessionBusPath());
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    await authenticate(socket);
    const connection = new DBusConnection(socket);
    const [uniqueName] = await connection.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "Hello",
    });
    connection.uniqueName = uniqueName as string;
    return connection;
  }

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("close", () => {
      for (const pending of this.pendingCalls.values()) {
        pending.reject(new Error("The D-Bus connection closed"));
      }
      this.pendingCalls.clear();
    });
  }

  /** The name the bus assigned to this connection, such as `:1.42`. */
  getUniqueName(): string {
    return this.uniqueName;
  }

  call({
    destination,
    path,
    interface: interfaceName,
    member,
    signature = "",
    body = [],
  }: {
    destination: string;
    path: string;
    interface: string;
    member: string;
    signature?: string;
    body?: unknown[];
  }): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const serial = this.send({
        type: MESSAGE_TYPE.call,
        flags: 0,
        destination,
        path,
        interface: interfaceName,
        member,
        signature,
        body,
      });
      this.pendingCalls.set(serial, { resolve, reject });
    });
  }

  exportObject(path: string, object: DBusObject): void {
    this.objects.set(path, object);
  }

  /**
   * Call `onChange` with whether `name` has an owner, once with the current
   * state and again whenever its owner changes.
   */
  async watchName(
    name: string,
    onChange: (hasOwner: boolean) => void,
  ): Promise<void> {
    await this.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "AddMatch",
      signature: "s",
      body: [
        `type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='${name}'`,
      ],
    });
    this.signalListeners.add((message) => {
      if (
        message.interface === "org.freedesktop.DBus" &&
        message.member === "NameOwnerChanged" &&
        message.body[0] === name
      ) {
        onChange(message.body[2] !== "");
      }
    });
    // Watch before asking, so an owner that appears in between is not missed.
    const [hasOwner] = await this.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "NameHasOwner",
      signature: "s",
      body: [name],
    });
    onChange(hasOwner as boolean);
  }

  close(): void {
    this.socket.end();
  }

  private send(message: Omit<Message, "serial">): number {
    this.serial += 1;
    this.socket.write(marshalMessage({ ...message, serial: this.serial }));
    return this.serial;
  }

  private receive(chunk: Buffer) {
    this.received = Buffer.concat([this.received, chunk]);
    for (;;) {
      const length = measureMessage(this.received);
      if (length === undefined || this.received.length < length) {
        break;
      }
      this.handleMessage(unmarshalMessage(this.received.subarray(0, length)));
      this.received = this.received.subarray(length);
    }
  }

  private handleMessage(message: Message) {
    switch (message.type) {
      case MESSAGE_TYPE.call: {
        this.handleCall(message);
        break;
      }
      case MESSAGE_TYPE.return:
      case MESSAGE_TYPE.error: {
        const pending = this.pendingCalls.get(message.replySerial!);
        this.pendingCalls.delete(message.replySerial!);
        if (message.type === MESSAGE_TYPE.return) {
          pending?.resolve(message.body);
        } else {
          pending?.reject(
            new DBusError({
              name: message.errorName!,
              message: String(message.body[0] ?? ""),
            }),
          );
        }
        break;
      }
      case MESSAGE_TYPE.signal: {
        for (const listener of this.signalListeners) {
          listener(message);
        }
        break;
      }
    }
  }

  private handleCall(message: Message) {
    let reply: Omit<Message, "serial" | "flags">;
    try {
      const result = answerCall({ objects: this.objects, message });
      reply = {
        type: MESSAGE_TYPE.return,
        replySerial: message.serial,
        destination: message.sender,
        ...result,
      };
    } catch (error) {
      reply = {
        type: MESSAGE_TYPE.error,
        replySerial: message.serial,
        destination: message.sender,
        errorName:
          error instanceof DBusError
            ? error.name
            : "org.freedesktop.DBus.Error.Failed",
        signature: "s",
        body: [error instanceof Error ? error.message : String(error)],
      };
    }
    if (!(message.flags & NO_REPLY_EXPECTED)) {
      this.send({ ...reply, flags: 0 });
    }
  }
}

function getSessionBusPath() {
  const address = process.env.DBUS_SESSION_BUS_ADDRESS;
  const path = address?.match(/^unix:(?:.*,)?path=([^,;]+)/)?.[1];
  if (!path) {
    throw new Error(
      `No session bus socket path in DBUS_SESSION_BUS_ADDRESS (${address})`,
    );
  }
  return decodeURIComponent(path);
}

/** Authenticate as the process's user, which the bus checks on the socket. */
async function authenticate(socket: net.Socket) {
  const uid = Buffer.from(String(process.getuid!())).toString("hex");
  socket.write(`\0AUTH EXTERNAL ${uid}\r\n`);
  const reply = await new Promise<string>((resolve, reject) => {
    let text = "";
    const onData = (chunk: Buffer) => {
      text += chunk.toString("latin1");
      if (text.includes("\r\n")) {
        socket.off("data", onData);
        socket.off("error", reject);
        resolve(text);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
  if (!reply.startsWith("OK ")) {
    throw new Error(`D-Bus authentication failed: ${reply.trim()}`);
  }
  socket.write("BEGIN\r\n");
}

//
// Exported objects
//

/**
 * Answer a method call on an exported object, or introspection on a path
 * above one, so a caller can find the objects by walking down from `/`.
 */
function answerCall({
  objects,
  message,
}: {
  objects: Map<string, DBusObject>;
  message: Message;
}): MethodReturn {
  const path = message.path!;
  const key = `${message.interface ?? ""} ${message.member}`;
  if (key === "org.freedesktop.DBus.Introspectable Introspect") {
    return { signature: "s", body: [getIntrospection({ objects, path })] };
  }
  const object = objects.get(path);
  if (!object) {
    throw new DBusError({
      name: "org.freedesktop.DBus.Error.UnknownObject",
      message: `No object at ${path}`,
    });
  }
  switch (key) {
    case "org.freedesktop.DBus.Properties Get": {
      const [, name] = message.body as [string, string];
      const value = object.properties[name];
      if (!value) {
        throw new DBusError({
          name: "org.freedesktop.DBus.Error.UnknownProperty",
          message: `No property ${name} on ${path}`,
        });
      }
      return { signature: "v", body: [value] };
    }
    case "org.freedesktop.DBus.Properties GetAll": {
      const [name] = message.body as [string];
      const properties =
        name === object.interface ? Object.entries(object.properties) : [];
      return { signature: "a{sv}", body: [properties] };
    }
    case "org.freedesktop.DBus.Peer Ping": {
      return { signature: "", body: [] };
    }
  }
  const method = object.methods[message.member!];
  if (
    !method ||
    (message.interface && message.interface !== object.interface)
  ) {
    throw new DBusError({
      name: "org.freedesktop.DBus.Error.UnknownMethod",
      message: `No method ${key} on ${path}`,
    });
  }
  return method(message.body);
}

// Introspection lists each interface by name only, because callers of the
// interfaces in use bring their own copies of the specifications.
function getIntrospection({
  objects,
  path,
}: {
  objects: Map<string, DBusObject>;
  path: string;
}) {
  const object = objects.get(path);
  const prefix = path === "/" ? "/" : `${path}/`;
  const children = new Set<string>();
  for (const objectPath of objects.keys()) {
    if (objectPath.startsWith(prefix) && objectPath !== path) {
      children.add(objectPath.slice(prefix.length).split("/")[0]!);
    }
  }
  if (!object && children.size === 0) {
    throw new DBusError({
      name: "org.freedesktop.DBus.Error.UnknownObject",
      message: `No object at ${path}`,
    });
  }
  const body = [
    ...(object ? [`<interface name="${object.interface}"/>`] : []),
    ...[...children].map((child) => `<node name="${child}"/>`),
  ].join("");
  return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd"><node>${body}</node>`;
}

//
// Messages
//

function marshalMessage(message: Message): Buffer {
  const body = new Writer();
  body.write(message.signature, message.body);
  const fields: [number, Variant][] = [];
  for (const { code, key, signature } of HEADER_FIELDS) {
    const value = message[key];
    if (value !== undefined && value !== "") {
      fields.push([code, { signature, value }]);
    }
  }
  const header = new Writer();
  header.write("yyyyuua(yv)", [
    "l".charCodeAt(0),
    message.type,
    message.flags,
    1,
    body.length,
    message.serial,
    fields,
  ]);
  header.align(8);
  return Buffer.concat([header.toBuffer(), body.toBuffer()]);
}

/** The full length of the message at the start of `data`, once its header's fixed part has arrived. */
function measureMessage(data: Buffer): number | undefined {
  if (data.length < 16) {
    return;
  }
  const bodyLength = data.readUInt32LE(4);
  const fieldsLength = data.readUInt32LE(12);
  return alignTo(16 + fieldsLength, 8) + bodyLength;
}

function unmarshalMessage(data: Buffer): Message {
  if (data[0] !== "l".charCodeAt(0)) {
    throw new Error("Big-endian D-Bus messages are not supported");
  }
  const reader = new Reader(data);
  const [, type, flags, , , serial, fields] = reader.read("yyyyuua(yv)") as [
    number,
    number,
    number,
    number,
    number,
    number,
    [number, Variant][],
  ];
  const message: Message = { type, flags, serial, signature: "", body: [] };
  for (const [code, { value }] of fields) {
    const field = HEADER_FIELDS.find((field) => field.code === code);
    if (field) {
      Object.assign(message, { [field.key]: value });
    }
  }
  reader.align(8);
  message.body = reader.read(message.signature);
  return message;
}

//
// Marshalling
//

function alignTo(offset: number, alignment: number) {
  return Math.ceil(offset / alignment) * alignment;
}

function getAlignment(type: string): number {
  switch (type[0]) {
    case "y":
    case "g":
    case "v": {
      return 1;
    }
    case "n":
    case "q": {
      return 2;
    }
    case "x":
    case "t":
    case "d":
    case "(":
    case "{": {
      return 8;
    }
    default: {
      return 4;
    }
  }
}

/** Split a signature into its complete types. */
function splitSignature(signature: string): string[] {
  const types: string[] = [];
  let start = 0;
  while (start < signature.length) {
    const end = findTypeEnd(signature, start);
    types.push(signature.slice(start, end));
    start = end;
  }
  return types;
}

function findTypeEnd(signature: string, start: number): number {
  const c = signature[start];
  if (c === "a") {
    return findTypeEnd(signature, start + 1);
  }
  if (c === "(" || c === "{") {
    const close = c === "(" ? ")" : "}";
    let depth = 0;
    for (let i = start; i < signature.length; i++) {
      if (signature[i] === c) {
        depth += 1;
      } else if (signature[i] === close) {
        depth -= 1;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
    throw new Error(`Unbalanced D-Bus signature: ${signature}`);
  }
  return start + 1;
}

class Writer {
  private chunks: Buffer[] = [];
  length = 0;

  toBuffer() {
    return Buffer.concat(this.chunks);
  }

  align(alignment: number) {
    const padding = alignTo(this.length, alignment) - this.length;
    if (padding > 0) {
      this.push(Buffer.alloc(padding));
    }
  }

  write(signature: string, values: unknown[]) {
    splitSignature(signature).forEach((type, i) =>
      this.writeValue(type, values[i]),
    );
  }

  private push(chunk: Buffer) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  private writeFixed(
    alignment: number,
    size: number,
    fill: (buffer: Buffer) => void,
  ) {
    this.align(alignment);
    const buffer = Buffer.alloc(size);
    fill(buffer);
    this.push(buffer);
  }

  private writeValue(type: string, value: unknown) {
    switch (type[0]) {
      case "y": {
        this.writeFixed(1, 1, (b) => b.writeUInt8(value as number));
        break;
      }
      case "b": {
        this.writeFixed(4, 4, (b) => b.writeUInt32LE(value ? 1 : 0));
        break;
      }
      case "n": {
        this.writeFixed(2, 2, (b) => b.writeInt16LE(value as number));
        break;
      }
      case "q": {
        this.writeFixed(2, 2, (b) => b.writeUInt16LE(value as number));
        break;
      }
      case "i": {
        this.writeFixed(4, 4, (b) => b.writeInt32LE(value as number));
        break;
      }
      case "u":
      case "h": {
        this.writeFixed(4, 4, (b) => b.writeUInt32LE(value as number));
        break;
      }
      case "x": {
        this.writeFixed(8, 8, (b) =>
          b.writeBigInt64LE(BigInt(value as bigint)),
        );
        break;
      }
      case "t": {
        this.writeFixed(8, 8, (b) =>
          b.writeBigUInt64LE(BigInt(value as bigint)),
        );
        break;
      }
      case "d": {
        this.writeFixed(8, 8, (b) => b.writeDoubleLE(value as number));
        break;
      }
      case "s":
      case "o": {
        const bytes = Buffer.from(value as string);
        this.writeFixed(4, 4, (b) => b.writeUInt32LE(bytes.length));
        this.push(Buffer.concat([bytes, Buffer.alloc(1)]));
        break;
      }
      case "g": {
        const bytes = Buffer.from(value as string);
        this.push(
          Buffer.concat([Buffer.from([bytes.length]), bytes, Buffer.alloc(1)]),
        );
        break;
      }
      case "v": {
        const { signature, value: inner } = value as Variant;
        this.writeValue("g", signature);
        this.writeValue(signature, inner);
        break;
      }
      case "a": {
        const elementType = type.slice(1);
        this.writeFixed(4, 4, () => {});
        const lengthChunk = this.chunks[this.chunks.length - 1]!;
        // The length excludes the padding before the first element.
        this.align(getAlignment(elementType));
        const start = this.length;
        for (const element of value as unknown[]) {
          this.writeValue(elementType, element);
        }
        lengthChunk.writeUInt32LE(this.length - start);
        break;
      }
      case "(":
      case "{": {
        this.align(8);
        this.write(type.slice(1, -1), value as unknown[]);
        break;
      }
      default: {
        throw new Error(`Unknown D-Bus type: ${type}`);
      }
    }
  }
}

class Reader {
  private offset = 0;

  private data: Buffer;

  constructor(data: Buffer) {
    this.data = data;
  }

  align(alignment: number) {
    this.offset = alignTo(this.offset, alignment);
  }

  read(signature: string): unknown[] {
    return splitSignature(signature).map((type) => this.readValue(type));
  }

  private readFixed<T>(alignment: number, read: (offset: number) => T): T {
    this.align(alignment);
    const value = read(this.offset);
    this.offset += alignment;
    return value;
  }

  private readValue(type: string): unknown {
    const data = this.data;
    switch (type[0]) {
      case "y": {
        return this.readFixed(1, (o) => data.readUInt8(o));
      }
      case "b": {
        return this.readFixed(4, (o) => data.readUInt32LE(o) !== 0);
      }
      case "n": {
        return this.readFixed(2, (o) => data.readInt16LE(o));
      }
      case "q": {
        return this.readFixed(2, (o) => data.readUInt16LE(o));
      }
      case "i": {
        return this.readFixed(4, (o) => data.readInt32LE(o));
      }
      case "u":
      case "h": {
        return this.readFixed(4, (o) => data.readUInt32LE(o));
      }
      case "x": {
        return this.readFixed(8, (o) => data.readBigInt64LE(o));
      }
      case "t": {
        return this.readFixed(8, (o) => data.readBigUInt64LE(o));
      }
      case "d": {
        return this.readFixed(8, (o) => data.readDoubleLE(o));
      }
      case "s":
      case "o": {
        const length = this.readFixed(4, (o) => data.readUInt32LE(o));
        const value = data.toString("utf8", this.offset, this.offset + length);
        this.offset += length + 1;
        return value;
      }
      case "g": {
        const length = data.readUInt8(this.offset);
        const value = data.toString(
          "utf8",
          this.offset + 1,
          this.offset + 1 + length,
        );
        this.offset += length + 2;
        return value;
      }
      case "v": {
        const signature = this.readValue("g") as string;
        return {
          signature,
          value: this.readValue(signature),
        } satisfies Variant;
      }
      case "a": {
        const elementType = type.slice(1);
        const length = this.readFixed(4, (o) => data.readUInt32LE(o));
        this.align(getAlignment(elementType));
        const end = this.offset + length;
        const elements: unknown[] = [];
        while (this.offset < end) {
          elements.push(this.readValue(elementType));
        }
        return elements;
      }
      case "(":
      case "{": {
        this.align(8);
        return this.read(type.slice(1, -1));
      }
      default: {
        throw new Error(`Unknown D-Bus type: ${type}`);
      }
    }
  }
}
