/**
 * The D-Bus wire format: messages to and from bytes, with every type marshalled
 * in little-endian.
 * https://dbus.freedesktop.org/doc/dbus-specification.html#message-protocol
 */

/**
 * Values map to JavaScript as follows: integers to numbers (64-bit ones to
 * bigints), structs and dict entries to arrays of their fields, arrays to
 * arrays, and variants to `Variant` objects.
 */
export type Variant = { signature: string; value: unknown };

export type Message = {
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

export const MESSAGE_TYPE = {
  call: 1,
  return: 2,
  error: 3,
  signal: 4,
} as const;
export const NO_REPLY_EXPECTED = 0x1;

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

export function marshalMessage(message: Message): Buffer {
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

/**
 * Split the complete messages off the start of `data`, and return the bytes of
 * a message that has not fully arrived yet.
 */
export function unmarshalMessages(data: Buffer): {
  messages: Message[];
  rest: Buffer;
} {
  const messages: Message[] = [];
  for (;;) {
    const length = measureMessage(data);
    if (length === undefined || data.length < length) {
      return { messages, rest: data };
    }
    messages.push(unmarshalMessage(data.subarray(0, length)));
    data = data.subarray(length);
  }
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
