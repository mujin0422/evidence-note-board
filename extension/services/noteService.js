// Typed asynchronous D-Bus boundary between GNOME Shell and the Rust backend.
// JSON is used only for structured return values; mutations retain native args.
import Gio from 'gi://Gio';

const XML = `<node>
  <interface name="io.github.mujin0422.EvidenceNoteBoard">
    <method name="ListNotes"><arg type="s" direction="out"/></method>
    <method name="CreateNote">
      <arg type="s" direction="in"/><arg type="s" direction="in"/>
      <arg type="d" direction="in"/><arg type="d" direction="in"/>
      <arg type="s" direction="out"/>
    </method>
    <method name="ImportImage">
      <arg type="s" direction="in"/><arg type="d" direction="in"/>
      <arg type="d" direction="in"/><arg type="s" direction="out"/>
    </method>
    <method name="UpdateNote">
      <arg type="s" direction="in"/><arg type="s" direction="in"/>
      <arg type="s" direction="in"/>
    </method>
    <method name="MoveNote">
      <arg type="s" direction="in"/><arg type="d" direction="in"/>
      <arg type="d" direction="in"/>
    </method>
    <method name="UpdateGeometry">
      <arg type="s" direction="in"/><arg type="d" direction="in"/>
      <arg type="d" direction="in"/><arg type="d" direction="in"/>
    </method>
    <method name="ListConnections"><arg type="s" direction="out"/></method>
    <method name="CreateConnection">
      <arg type="s" direction="in"/><arg type="s" direction="in"/>
      <arg type="s" direction="out"/>
    </method>
    <method name="DeleteConnection"><arg type="s" direction="in"/></method>
    <method name="DeleteNote"><arg type="s" direction="in"/></method>
    <method name="GetSettings"><arg type="s" direction="out"/></method>
    <method name="SaveSettings">
      <arg type="b" direction="in"/><arg type="b" direction="in"/>
      <arg type="d" direction="in"/>
    </method>
    <method name="GetView"><arg type="s" direction="out"/></method>
    <method name="SaveView">
      <arg type="d" direction="in"/><arg type="d" direction="in"/>
      <arg type="d" direction="in"/>
    </method>
  </interface>
</node>`;

const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);
const SERVICE = 'io.github.mujin0422.EvidenceNoteBoard';
const PATH = '/io/github/mujin0422/EvidenceNoteBoard';

// All calls use the asynchronous GJS D-Bus proxy API. Mutations are
// serialized to preserve order (older autosaves may not overtake newer ones).
export class NoteService {
    // Wrap a connected proxy and initialize the mutation serialization chain.
    constructor(proxy) {
        this._proxy = proxy;
        this._tail = Promise.resolve();
    }

    // Connect to the well-known user-session service and verify name ownership.
    static async connect() {
        const proxy = await new Promise((resolve, reject) => {
            new Proxy(Gio.DBus.session, SERVICE, PATH, (instance, error) => {
                if (error)
                    reject(error);
                else
                    resolve(instance);
            });
        });
        if (!proxy.g_name_owner)
            throw new Error('Backend D-Bus service is not running');
        return new NoteService(proxy);
    }

    // Queue writes so an older autosave cannot overtake a newer user action.
    _enqueue(action) {
        const call = this._tail.then(action);
        this._tail = call.catch(() => undefined);
        return call;
    }

    // Fetch and decode all notes.
    async listNotes() {
        const [payload] = await this._proxy.ListNotesAsync();
        return JSON.parse(payload);
    }

    // Fetch and decode persisted UI preferences.
    async getSettings() {
        const [payload] = await this._proxy.GetSettingsAsync();
        return JSON.parse(payload);
    }

    // Persist UI preferences in mutation order.
    saveSettings(options) {
        return this._enqueue(() => this._proxy.SaveSettingsAsync(
            options.show_hud, options.show_strings, options.zoom_step));
    }

    // Fetch and decode the persisted camera.
    async getView() {
        const [payload] = await this._proxy.GetViewAsync();
        return JSON.parse(payload);
    }

    // Create a text note and decode the returned record.
    createNote(title, content, x, y) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.CreateNoteAsync(title, content, x, y);
            return JSON.parse(payload);
        });
    }

    // Import an image selected through the GNOME file chooser.
    importImage(filePath, x, y) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.ImportImageAsync(filePath, x, y);
            return JSON.parse(payload);
        });
    }

    // Save the legacy title field and rich/plain body payload.
    updateNote(id, title, content) {
        return this._enqueue(() => this._proxy.UpdateNoteAsync(id, title, content));
    }

    // Persist a note's world-space position.
    moveNote(id, x, y) {
        return this._enqueue(() => this._proxy.MoveNoteAsync(id, x, y));
    }

    // Persist paper dimensions and rotation.
    updateGeometry(id, width, height, rotation) {
        return this._enqueue(() =>
            this._proxy.UpdateGeometryAsync(id, width, height, rotation));
    }

    // Fetch and decode all red-string edges.
    async listConnections() {
        const [payload] = await this._proxy.ListConnectionsAsync();
        return JSON.parse(payload);
    }

    // Create or retrieve the edge between two note pins.
    createConnection(sourceId, targetId) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.CreateConnectionAsync(sourceId, targetId);
            return JSON.parse(payload);
        });
    }

    // Remove one edge.
    deleteConnection(id) {
        return this._enqueue(() => this._proxy.DeleteConnectionAsync(id));
    }

    // Remove one note and any cascading pin/edge data.
    deleteNote(id) {
        return this._enqueue(() => this._proxy.DeleteNoteAsync(id));
    }

    // Persist zoom and pan in mutation order.
    saveView(zoom, panX, panY) {
        return this._enqueue(() => this._proxy.SaveViewAsync(zoom, panX, panY));
    }
}
