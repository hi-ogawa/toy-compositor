import net from "node:net";

/**
 * A minimal client for the D-Bus session bus, enough to call a method and
 * receive a signal addressed to this connection. It speaks the wire protocol
 * directly over the bus socket because no npm D-Bus package is maintained,
 * and the `gdbus` CLI cannot stay connected for a reply that arrives later
 * as a signal.
 * https://dbus.freedesktop.org/doc/dbus-specification.html
 */
export class DBusConnection {
  /** The bus-assigned name, such as `:1.42`. */
  uniqueName = "";
  private buffer = Buffer.alloc(0);
  private serial = 0;
  private replies = new Map<number, Waiter>();
  private signalWaiters = new Set<SignalWaiter>();
  private socket: net.Socket;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("close", () =>
      this.rejectAll(new Error("D-Bus connection closed")),
    );
    socket.on("error", (error) => this.rejectAll(error));
  }

  static async connectSession(): Promise<DBusConnection> {
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

  /** Calls a method and resolves with the reply's body values. */
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
    const serial = ++this.serial;
    const fields: [number, DBusVariant][] = [
      [FIELD.path, { signature: "o", value: path }],
      [FIELD.interface, { signature: "s", value: interfaceName }],
      [FIELD.member, { signature: "s", value: member }],
      [FIELD.destination, { signature: "s", value: destination }],
    ];
    if (signature) {
      fields.push([FIELD.signature, { signature: "g", value: signature }]);
    }
    const bodyWriter = new Writer();
    bodyWriter.writeValues(signature, body);
    const bodyBytes = bodyWriter.toBuffer();
    const header = new Writer();
    header.writeValues("yyyyuua(yv)", [
      "l".charCodeAt(0),
      MESSAGE_TYPE.methodCall,
      0,
      1,
      bodyBytes.length,
      serial,
      fields,
    ]);
    header.align(8);
    return new Promise((resolve, reject) => {
      this.replies.set(serial, { resolve, reject });
      this.socket.write(Buffer.concat([header.toBuffer(), bodyBytes]));
    });
  }

  /**
   * Resolves with the body of the next matching signal sent to this
   * connection. Call it before the method that triggers the signal.
   */
  waitForSignal({
    path,
    interface: interfaceName,
    member,
  }: {
    path: string;
    interface: string;
    member: string;
  }): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      this.signalWaiters.add({
        path,
        interface: interfaceName,
        member,
        resolve,
        reject,
      });
    });
  }

  close() {
    this.socket.end();
  }

  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 16) {
      const littleEndian = this.buffer[0] === "l".charCodeAt(0);
      const bodyLength = littleEndian
        ? this.buffer.readUInt32LE(4)
        : this.buffer.readUInt32BE(4);
      const fieldsLength = littleEndian
        ? this.buffer.readUInt32LE(12)
        : this.buffer.readUInt32BE(12);
      const bodyStart = alignTo(16 + fieldsLength, 8);
      const end = bodyStart + bodyLength;
      if (this.buffer.length < end) {
        return;
      }
      this.dispatch(this.buffer.subarray(0, end), bodyStart, littleEndian);
      this.buffer = this.buffer.subarray(end);
    }
  }

  private dispatch(message: Buffer, bodyStart: number, littleEndian: boolean) {
    const [, type, , , , , fieldList] = new Reader(
      message,
      littleEndian,
    ).readValues("yyyyuua(yv)") as [
      number,
      number,
      number,
      number,
      number,
      number,
      [number, unknown][],
    ];
    const fields = new Map(fieldList);
    const signature = (fields.get(FIELD.signature) as string) ?? "";
    const body = new Reader(
      message.subarray(bodyStart),
      littleEndian,
    ).readValues(signature);
    switch (type) {
      case MESSAGE_TYPE.methodReturn:
      case MESSAGE_TYPE.error: {
        const serial = fields.get(FIELD.replySerial) as number;
        const waiter = this.replies.get(serial);
        this.replies.delete(serial);
        if (type === MESSAGE_TYPE.methodReturn) {
          waiter?.resolve(body);
        } else {
          waiter?.reject(
            new Error(`${fields.get(FIELD.errorName)}: ${body[0] ?? ""}`),
          );
        }
        break;
      }
      case MESSAGE_TYPE.signal: {
        for (const waiter of this.signalWaiters) {
          if (
            waiter.path === fields.get(FIELD.path) &&
            waiter.interface === fields.get(FIELD.interface) &&
            waiter.member === fields.get(FIELD.member)
          ) {
            this.signalWaiters.delete(waiter);
            waiter.resolve(body);
          }
        }
        break;
      }
    }
  }

  private rejectAll(error: Error) {
    for (const waiter of [...this.replies.values(), ...this.signalWaiters]) {
      waiter.reject(error);
    }
    this.replies.clear();
    this.signalWaiters.clear();
  }
}

/** A value of a `v` type, written with its own signature. Read variants unwrap to their value. */
export type DBusVariant = { signature: string; value: unknown };

type Waiter = {
  resolve: (body: unknown[]) => void;
  reject: (error: Error) => void;
};

type SignalWaiter = Waiter & {
  path: string;
  interface: string;
  member: string;
};

const MESSAGE_TYPE = { methodCall: 1, methodReturn: 2, error: 3, signal: 4 };

const FIELD = {
  path: 1,
  interface: 2,
  member: 3,
  errorName: 4,
  replySerial: 5,
  destination: 6,
  signature: 8,
};

function getSessionBusPath(): string {
  // systemd sets a single `unix:path=...` address, optionally with a guid.
  const address = process.env.DBUS_SESSION_BUS_ADDRESS ?? "";
  const match = /^unix:(?:.*,)?path=([^,;]+)/.exec(address);
  if (!match) {
    throw new Error(`Unsupported D-Bus session bus address "${address}"`);
  }
  return decodeURIComponent(match[1]);
}

// SASL EXTERNAL authenticates as the socket peer's uid, sent in hex digits.
async function authenticate(socket: net.Socket) {
  const uid = Buffer.from(String(process.getuid!())).toString("hex");
  socket.write(`\0AUTH EXTERNAL ${uid}\r\n`);
  const line = await new Promise<string>((resolve, reject) => {
    let received = "";
    const onData = (chunk: Buffer) => {
      received += chunk.toString("latin1");
      if (received.includes("\r\n")) {
        socket.off("data", onData);
        resolve(received);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
  if (!line.startsWith("OK ")) {
    throw new Error(`D-Bus authentication failed: ${line.trim()}`);
  }
  socket.write("BEGIN\r\n");
}

function alignTo(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment;
}

const ALIGNMENT: Record<string, number> = {
  y: 1,
  b: 4,
  n: 2,
  q: 2,
  i: 4,
  u: 4,
  x: 8,
  t: 8,
  d: 8,
  h: 4,
  s: 4,
  o: 4,
  g: 1,
  v: 1,
  a: 4,
  "(": 8,
  "{": 8,
};

/** Splits a signature into its complete types, such as `sa{sv}` into `s` and `a{sv}`. */
function splitSignature(signature: string): string[] {
  const types: string[] = [];
  let start = 0;
  while (start < signature.length) {
    let end = start;
    while (signature[end] === "a") {
      end++;
    }
    if (signature[end] === "(" || signature[end] === "{") {
      let depth = 0;
      do {
        if (signature[end] === "(" || signature[end] === "{") {
          depth++;
        } else if (signature[end] === ")" || signature[end] === "}") {
          depth--;
        }
        end++;
      } while (depth > 0);
    } else {
      end++;
    }
    types.push(signature.slice(start, end));
    start = end;
  }
  return types;
}

class Writer {
  private bytes: number[] = [];

  toBuffer(): Buffer {
    return Buffer.from(this.bytes);
  }

  align(alignment: number) {
    while (this.bytes.length % alignment) {
      this.bytes.push(0);
    }
  }

  writeValues(signature: string, values: unknown[]) {
    splitSignature(signature).forEach((type, i) =>
      this.writeValue(type, values[i]),
    );
  }

  private writeValue(type: string, value: unknown) {
    this.align(ALIGNMENT[type[0]]);
    switch (type[0]) {
      case "y": {
        this.bytes.push(value as number);
        break;
      }
      case "b": {
        this.writeUint32(value ? 1 : 0);
        break;
      }
      case "u": {
        this.writeUint32(value as number);
        break;
      }
      case "s":
      case "o": {
        const bytes = Buffer.from(value as string);
        this.writeUint32(bytes.length);
        this.bytes.push(...bytes, 0);
        break;
      }
      case "g": {
        const bytes = Buffer.from(value as string);
        this.bytes.push(bytes.length, ...bytes, 0);
        break;
      }
      case "v": {
        const variant = value as DBusVariant;
        this.writeValue("g", variant.signature);
        this.writeValue(variant.signature, variant.value);
        break;
      }
      case "a": {
        const elementType = type.slice(1);
        // Dicts are written from plain objects, other arrays from arrays.
        const elements =
          elementType[0] === "{" && !Array.isArray(value)
            ? Object.entries(value as object)
            : (value as unknown[]);
        const lengthOffset = this.bytes.length;
        this.writeUint32(0);
        // The length excludes the padding before the first element.
        this.align(ALIGNMENT[elementType[0]]);
        const start = this.bytes.length;
        for (const element of elements) {
          this.writeValue(elementType, element);
        }
        const length = this.bytes.length - start;
        this.bytes.splice(lengthOffset, 4, ...uint32LE(length));
        break;
      }
      case "(":
      case "{": {
        this.writeValues(type.slice(1, -1), value as unknown[]);
        break;
      }
      default: {
        throw new Error(`Unsupported D-Bus type to write "${type}"`);
      }
    }
  }

  private writeUint32(value: number) {
    this.bytes.push(...uint32LE(value));
  }
}

function uint32LE(value: number): number[] {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return [...buffer];
}

class Reader {
  private offset = 0;
  private buffer: Buffer;
  private littleEndian: boolean;

  constructor(buffer: Buffer, littleEndian: boolean) {
    this.buffer = buffer;
    this.littleEndian = littleEndian;
  }

  readValues(signature: string): unknown[] {
    return splitSignature(signature).map((type) => this.readValue(type));
  }

  private readValue(type: string): unknown {
    this.offset = alignTo(this.offset, ALIGNMENT[type[0]]);
    const le = this.littleEndian;
    const buffer = this.buffer;
    const read = <T>(size: number, value: T): T => {
      this.offset += size;
      return value;
    };
    const at = this.offset;
    switch (type[0]) {
      case "y": {
        return read(1, buffer[at]);
      }
      case "b": {
        return read(4, this.readUint32(at) !== 0);
      }
      case "n": {
        return read(2, le ? buffer.readInt16LE(at) : buffer.readInt16BE(at));
      }
      case "q": {
        return read(2, le ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
      }
      case "i": {
        return read(4, le ? buffer.readInt32LE(at) : buffer.readInt32BE(at));
      }
      case "u":
      case "h": {
        return read(4, this.readUint32(at));
      }
      case "x": {
        return read(
          8,
          le ? buffer.readBigInt64LE(at) : buffer.readBigInt64BE(at),
        );
      }
      case "t": {
        return read(
          8,
          le ? buffer.readBigUInt64LE(at) : buffer.readBigUInt64BE(at),
        );
      }
      case "d": {
        return read(8, le ? buffer.readDoubleLE(at) : buffer.readDoubleBE(at));
      }
      case "s":
      case "o": {
        const length = this.readUint32(at);
        this.offset += 4 + length + 1;
        return buffer.toString("utf8", at + 4, at + 4 + length);
      }
      case "g": {
        const length = buffer[at];
        this.offset += 1 + length + 1;
        return buffer.toString("utf8", at + 1, at + 1 + length);
      }
      case "v": {
        const signature = this.readValue("g") as string;
        return this.readValue(signature);
      }
      case "a": {
        const elementType = type.slice(1);
        const length = this.readUint32(at);
        this.offset = alignTo(at + 4, ALIGNMENT[elementType[0]]);
        const end = this.offset + length;
        const elements: unknown[] = [];
        while (this.offset < end) {
          elements.push(this.readValue(elementType));
        }
        // Dicts are read into plain objects, as their keys are basic types.
        return elementType[0] === "{"
          ? Object.fromEntries(elements as [PropertyKey, unknown][])
          : elements;
      }
      case "(":
      case "{": {
        return this.readValues(type.slice(1, -1));
      }
      default: {
        throw new Error(`Unsupported D-Bus type to read "${type}"`);
      }
    }
  }

  private readUint32(at: number): number {
    return this.littleEndian
      ? this.buffer.readUInt32LE(at)
      : this.buffer.readUInt32BE(at);
  }
}
