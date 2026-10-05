import {
  connectSessionBus,
  DBusError,
  type MethodCall,
  type MethodReturn,
  type Variant,
} from "./dbus.ts";

const WATCHER_NAME = "org.kde.StatusNotifierWatcher";
const ITEM_PATH = "/StatusNotifierItem";
const ITEM_INTERFACE = "org.kde.StatusNotifierItem";
const MENU_PATH = "/MenuBar";
const MENU_INTERFACE = "com.canonical.dbusmenu";

/**
 * A tray item for the running server, shown by a StatusNotifierItem host, such
 * as GNOME's AppIndicator extension, with a menu that DBusMenu describes.
 * https://specifications.freedesktop.org/status-notifier-item/latest/
 *
 * The item registers with the watcher whenever one takes the watcher's name,
 * so it comes back after the host restarts, and the host removes it once the
 * bus connection closes.
 */
export async function createTray({
  url,
  iconThemePath,
  iconName,
  onOpen,
  onQuit,
}: {
  url: string;
  iconThemePath: string;
  iconName: string;
  onOpen: () => void;
  onQuit: () => void;
}) {
  const bus = await connectSessionBus();

  const itemProperties: Record<string, Variant> = {
    Category: { signature: "s", value: "ApplicationStatus" },
    Id: { signature: "s", value: "toy-compositor" },
    Title: { signature: "s", value: "Toy Compositor" },
    Status: { signature: "s", value: "Active" },
    WindowId: { signature: "i", value: 0 },
    IconThemePath: { signature: "s", value: iconThemePath },
    IconName: { signature: "s", value: iconName },
    IconPixmap: { signature: "a(iiay)", value: [] },
    OverlayIconName: { signature: "s", value: "" },
    AttentionIconName: { signature: "s", value: "" },
    ToolTip: {
      signature: "(sa(iiay)ss)",
      value: ["", [], "Toy Compositor", url],
    },
    // A host that follows this opens the menu on a click, and one that calls
    // Activate instead opens the editor.
    ItemIsMenu: { signature: "b", value: true },
    Menu: { signature: "o", value: MENU_PATH },
  };
  const menuProperties: Record<string, Variant> = {
    Version: { signature: "u", value: 3 },
    TextDirection: { signature: "s", value: "ltr" },
    Status: { signature: "s", value: "normal" },
    IconThemePath: { signature: "as", value: [] },
  };

  // The menu never changes, so its layout stays at one revision.
  const menuItems: { id: number; properties: Record<string, Variant> }[] = [
    {
      id: 1,
      properties: {
        label: { signature: "s", value: `Running at ${url}` },
        enabled: { signature: "b", value: false },
      },
    },
    { id: 2, properties: { label: { signature: "s", value: "Open editor" } } },
    { id: 3, properties: { label: { signature: "s", value: "Quit" } } },
  ];
  const menuActions: Record<number, () => void> = { 2: onOpen, 3: onQuit };
  const rootProperties: Record<string, Variant> = {
    "children-display": { signature: "s", value: "submenu" },
  };

  function getMenuItemProperties(id: number) {
    if (id === 0) {
      return rootProperties;
    }
    const item = menuItems.find((item) => item.id === id);
    if (!item) {
      throw new DBusError({
        name: "org.freedesktop.DBus.Error.InvalidArgs",
        message: `No menu item ${id}`,
      });
    }
    return item.properties;
  }

  // A layout node is `(ia{sv}av)`, with the children as variants of nodes.
  function getLayout(id: number): unknown[] {
    const children =
      id === 0
        ? menuItems.map((item) => ({
            signature: "(ia{sv}av)",
            value: getLayout(item.id),
          }))
        : [];
    return [id, Object.entries(getMenuItemProperties(id)), children];
  }

  bus.exportObject(ITEM_PATH, (call) =>
    handleObjectCall({
      call,
      interfaceName: ITEM_INTERFACE,
      properties: itemProperties,
      handleMethod: (member) => {
        switch (member) {
          case "Activate":
          case "SecondaryActivate": {
            onOpen();
            return { signature: "", body: [] };
          }
          case "ContextMenu":
          case "Scroll": {
            return { signature: "", body: [] };
          }
        }
      },
    }),
  );

  bus.exportObject(MENU_PATH, (call) =>
    handleObjectCall({
      call,
      interfaceName: MENU_INTERFACE,
      properties: menuProperties,
      handleMethod: (member, body) => {
        switch (member) {
          case "GetLayout": {
            const [parentId] = body as [number];
            return { signature: "u(ia{sv}av)", body: [1, getLayout(parentId)] };
          }
          case "GetGroupProperties": {
            const [ids] = body as [number[]];
            const requested =
              ids.length > 0 ? ids : [0, ...menuItems.map((item) => item.id)];
            return {
              signature: "a(ia{sv})",
              body: [
                requested.map((id) => [
                  id,
                  Object.entries(getMenuItemProperties(id)),
                ]),
              ],
            };
          }
          case "GetProperty": {
            const [id, name] = body as [number, string];
            const value = getMenuItemProperties(id)[name];
            if (!value) {
              throw new DBusError({
                name: "org.freedesktop.DBus.Error.InvalidArgs",
                message: `No property ${name} on menu item ${id}`,
              });
            }
            return { signature: "v", body: [value] };
          }
          case "Event": {
            const [id, eventId] = body as [number, string];
            if (eventId === "clicked") {
              menuActions[id]?.();
            }
            return { signature: "", body: [] };
          }
          case "EventGroup": {
            const [events] = body as [[number, string][]];
            for (const [id, eventId] of events) {
              if (eventId === "clicked") {
                menuActions[id]?.();
              }
            }
            return { signature: "ai", body: [[]] };
          }
          case "AboutToShow": {
            return { signature: "b", body: [false] };
          }
          case "AboutToShowGroup": {
            return { signature: "aiai", body: [[], []] };
          }
        }
      },
    }),
  );

  bus.exportObject("/", (call) =>
    handleObjectCall({
      call,
      interfaceName: "",
      properties: {},
      handleMethod: () => undefined,
    }),
  );

  async function register() {
    await bus.call({
      destination: WATCHER_NAME,
      path: "/StatusNotifierWatcher",
      interface: "org.kde.StatusNotifierWatcher",
      member: "RegisterStatusNotifierItem",
      signature: "s",
      body: [bus.uniqueName],
    });
  }

  await bus.addSignalListener(
    `type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0='${WATCHER_NAME}'`,
    ({ body }) => {
      const [, , newOwner] = body as [string, string, string];
      if (newOwner) {
        register().catch((error: unknown) => {
          console.error("Failed to register the tray item:", error);
        });
      }
    },
  );
  try {
    await register();
  } catch (error) {
    if (
      !(error instanceof DBusError) ||
      error.name !== "org.freedesktop.DBus.Error.ServiceUnknown"
    ) {
      throw error;
    }
    console.warn(
      "No tray host is running, so the tray item appears once one starts. On GNOME, enable the AppIndicator and KStatusNotifierItem Support extension.",
    );
  }

  return {
    close() {
      bus.close();
    },
  };
}

/**
 * Answer the standard Properties and Introspectable interfaces for an object
 * with one interface, and pass that interface's other calls to `handleMethod`,
 * which returns undefined for a method it does not have.
 */
function handleObjectCall({
  call,
  interfaceName,
  properties,
  handleMethod,
}: {
  call: MethodCall;
  interfaceName: string;
  properties: Record<string, Variant>;
  handleMethod: (member: string, body: unknown[]) => MethodReturn | undefined;
}): MethodReturn {
  const key = `${call.interface ?? ""} ${call.member}`;
  switch (key) {
    case "org.freedesktop.DBus.Properties Get": {
      const [, name] = call.body as [string, string];
      const value = properties[name];
      if (!value) {
        throw new DBusError({
          name: "org.freedesktop.DBus.Error.UnknownProperty",
          message: `No property ${name}`,
        });
      }
      return { signature: "v", body: [value] };
    }
    case "org.freedesktop.DBus.Properties GetAll": {
      const [name] = call.body as [string];
      return {
        signature: "a{sv}",
        body: [name === interfaceName ? Object.entries(properties) : []],
      };
    }
    case "org.freedesktop.DBus.Introspectable Introspect": {
      return { signature: "s", body: [getIntrospection(call.path)] };
    }
    case "org.freedesktop.DBus.Peer Ping": {
      return { signature: "", body: [] };
    }
  }
  if (!call.interface || call.interface === interfaceName) {
    const result = handleMethod(call.member, call.body);
    if (result) {
      return result;
    }
  }
  throw new DBusError({
    name: "org.freedesktop.DBus.Error.UnknownMethod",
    message: `No method ${key} on ${call.path}`,
  });
}

// Hosts read the interfaces from their own copies of the specifications, so
// introspection only lists the objects and their interface names.
function getIntrospection(path: string) {
  const interfaces: Record<string, string> = {
    [ITEM_PATH]: ITEM_INTERFACE,
    [MENU_PATH]: MENU_INTERFACE,
  };
  const body =
    path === "/"
      ? `<node name="${ITEM_PATH.slice(1)}"/><node name="${MENU_PATH.slice(1)}"/>`
      : `<interface name="${interfaces[path]}"/>`;
  return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd"><node>${body}</node>`;
}
