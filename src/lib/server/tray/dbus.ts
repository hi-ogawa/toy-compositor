import net from "node:net";
import {
  marshalMessage,
  type Message,
  MESSAGE_TYPE,
  NO_REPLY_EXPECTED,
  unmarshalMessages,
  type Variant,
} from "./dbus-message.ts";

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

/**
 * The subset of D-Bus that the tray needs: a session bus connection with
 * EXTERNAL authentication, method calls, exported objects that answer the
 * standard interfaces, and the bus's name ownership.
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
  private received: Buffer = Buffer.alloc(0);
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

  /** Whether any connection owns `name`. */
  async checkNameOwner(name: string): Promise<boolean> {
    const [hasOwner] = await this.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "NameHasOwner",
      signature: "s",
      body: [name],
    });
    return hasOwner as boolean;
  }

  /**
   * Call `onChange` with the unique name of `name`'s new owner whenever it
   * changes, or with an empty string when nobody owns it.
   */
  async watchNameOwner(
    name: string,
    onChange: (owner: string) => void,
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
        onChange(message.body[2] as string);
      }
    });
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
    const { messages, rest } = unmarshalMessages(
      Buffer.concat([this.received, chunk]),
    );
    this.received = rest;
    for (const message of messages) {
      this.handleMessage(message);
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
