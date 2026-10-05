import {
  DBusConnection,
  DBusError,
  type DBusObject,
  type Variant,
} from "./dbus.ts";

const WATCHER_NAME = "org.kde.StatusNotifierWatcher";
const ITEM_PATH = "/StatusNotifierItem";
const MENU_PATH = "/MenuBar";
const NO_HOST_WARNING =
  "No tray host is running, so the tray item appears once one starts. On GNOME, enable the AppIndicator and KStatusNotifierItem Support extension.";

/**
 * A tray item for the running server, shown by a StatusNotifierItem host, such
 * as GNOME's AppIndicator extension, with a menu that DBusMenu describes.
 * https://specifications.freedesktop.org/status-notifier-item/latest/
 *
 * The item registers with the watcher whenever one takes the watcher's name,
 * so it comes back after the host restarts, and the host removes it once the
 * bus connection closes.
 */
export class Tray {
  private readonly bus: DBusConnection;

  static async create(options: {
    url: string;
    iconThemePath: string;
    iconName: string;
    onOpen: () => void;
    onQuit: () => void;
  }): Promise<Tray> {
    const tray = new Tray({ bus: await DBusConnection.create(), ...options });
    // Watch before asking, so a host that starts in between is not missed.
    await tray.bus.watchNameOwner(WATCHER_NAME, (owner) => {
      if (owner) {
        void tray.register();
      } else {
        console.warn(NO_HOST_WARNING);
      }
    });
    const [hasHost] = await tray.bus.call({
      destination: "org.freedesktop.DBus",
      path: "/org/freedesktop/DBus",
      interface: "org.freedesktop.DBus",
      member: "NameHasOwner",
      signature: "s",
      body: [WATCHER_NAME],
    });
    if (hasHost) {
      await tray.register();
    } else {
      console.warn(NO_HOST_WARNING);
    }
    return tray;
  }

  private constructor({
    bus,
    url,
    iconThemePath,
    iconName,
    onOpen,
    onQuit,
  }: {
    bus: DBusConnection;
    url: string;
    iconThemePath: string;
    iconName: string;
    onOpen: () => void;
    onQuit: () => void;
  }) {
    this.bus = bus;
    bus.exportObject(
      ITEM_PATH,
      new StatusNotifierItem({
        id: "toy-compositor",
        title: "Toy Compositor",
        url,
        iconThemePath,
        iconName,
        onActivate: onOpen,
      }).dbusObject,
    );
    bus.exportObject(
      MENU_PATH,
      new DBusMenu([
        { label: `Running at ${url}`, enabled: false },
        { label: "Open editor", onClick: onOpen },
        { label: "Quit", onClick: onQuit },
      ]).dbusObject,
    );
  }

  close(): void {
    this.bus.close();
  }

  private async register() {
    try {
      await this.bus.call({
        destination: WATCHER_NAME,
        path: "/StatusNotifierWatcher",
        interface: "org.kde.StatusNotifierWatcher",
        member: "RegisterStatusNotifierItem",
        signature: "s",
        body: [this.bus.getUniqueName()],
      });
    } catch (error) {
      console.error("Failed to register the tray item:", error);
    }
  }
}

const EMPTY_REPLY = { signature: "", body: [] };

class StatusNotifierItem {
  readonly dbusObject: DBusObject;

  constructor({
    id,
    title,
    url,
    iconThemePath,
    iconName,
    onActivate,
  }: {
    id: string;
    title: string;
    url: string;
    iconThemePath: string;
    iconName: string;
    onActivate: () => void;
  }) {
    this.dbusObject = {
      interface: "org.kde.StatusNotifierItem",
      properties: {
        Category: { signature: "s", value: "ApplicationStatus" },
        Id: { signature: "s", value: id },
        Title: { signature: "s", value: title },
        Status: { signature: "s", value: "Active" },
        WindowId: { signature: "i", value: 0 },
        IconThemePath: { signature: "s", value: iconThemePath },
        IconName: { signature: "s", value: iconName },
        IconPixmap: { signature: "a(iiay)", value: [] },
        OverlayIconName: { signature: "s", value: "" },
        AttentionIconName: { signature: "s", value: "" },
        ToolTip: {
          signature: "(sa(iiay)ss)",
          value: ["", [], title, url],
        },
        // A host that follows this opens the menu on a click, and one that
        // calls Activate instead runs `onActivate`.
        ItemIsMenu: { signature: "b", value: true },
        Menu: { signature: "o", value: MENU_PATH },
      },
      methods: {
        Activate: () => {
          onActivate();
          return EMPTY_REPLY;
        },
        SecondaryActivate: () => {
          onActivate();
          return EMPTY_REPLY;
        },
        ContextMenu: () => EMPTY_REPLY,
        Scroll: () => EMPTY_REPLY,
      },
    };
  }
}

type MenuItem = { label: string; enabled?: boolean; onClick?: () => void };

/**
 * A flat DBusMenu whose items never change, so its layout stays at one
 * revision. Item ids count from 1 in order, because id 0 is the root.
 */
class DBusMenu {
  readonly dbusObject: DBusObject;
  private readonly items: MenuItem[];

  constructor(items: MenuItem[]) {
    this.items = items;
    this.dbusObject = {
      interface: "com.canonical.dbusmenu",
      properties: {
        Version: { signature: "u", value: 3 },
        TextDirection: { signature: "s", value: "ltr" },
        Status: { signature: "s", value: "normal" },
        IconThemePath: { signature: "as", value: [] },
      },
      methods: {
        GetLayout: (body) => {
          const [parentId] = body as [number];
          return {
            signature: "u(ia{sv}av)",
            body: [1, this.getLayout(parentId)],
          };
        },
        GetGroupProperties: (body) => {
          const [ids] = body as [number[]];
          const requested =
            ids.length > 0 ? ids : [0, ...this.items.map((_, i) => i + 1)];
          return {
            signature: "a(ia{sv})",
            body: [
              requested.map((id) => [
                id,
                Object.entries(this.getItemProperties(id)),
              ]),
            ],
          };
        },
        GetProperty: (body) => {
          const [id, name] = body as [number, string];
          const value = this.getItemProperties(id)[name];
          if (!value) {
            throw new DBusError({
              name: "org.freedesktop.DBus.Error.InvalidArgs",
              message: `No property ${name} on menu item ${id}`,
            });
          }
          return { signature: "v", body: [value] };
        },
        Event: (body) => {
          const [id, eventId] = body as [number, string];
          this.handleEvent(id, eventId);
          return EMPTY_REPLY;
        },
        EventGroup: (body) => {
          const [events] = body as [[number, string][]];
          for (const [id, eventId] of events) {
            this.handleEvent(id, eventId);
          }
          return { signature: "ai", body: [[]] };
        },
        AboutToShow: () => ({ signature: "b", body: [false] }),
        AboutToShowGroup: () => ({ signature: "aiai", body: [[], []] }),
      },
    };
  }

  private getItemProperties(id: number): Record<string, Variant> {
    if (id === 0) {
      return { "children-display": { signature: "s", value: "submenu" } };
    }
    const item = this.items[id - 1];
    if (!item) {
      throw new DBusError({
        name: "org.freedesktop.DBus.Error.InvalidArgs",
        message: `No menu item ${id}`,
      });
    }
    return {
      label: { signature: "s", value: item.label },
      enabled: { signature: "b", value: item.enabled ?? true },
    };
  }

  // A layout node is `(ia{sv}av)`, with the children as variants of nodes.
  private getLayout(id: number): unknown[] {
    const children =
      id === 0
        ? this.items.map((_, i) => ({
            signature: "(ia{sv}av)",
            value: this.getLayout(i + 1),
          }))
        : [];
    return [id, Object.entries(this.getItemProperties(id)), children];
  }

  private handleEvent(id: number, eventId: string) {
    if (eventId === "clicked") {
      this.items[id - 1]?.onClick?.();
    }
  }
}
