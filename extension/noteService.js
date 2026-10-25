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
    <method name="DuplicateImage">
      <arg type="s" direction="in"/><arg type="d" direction="in"/>
      <arg type="d" direction="in"/><arg type="s" direction="out"/>
    </method>
    <method name="DeleteNote"><arg type="s" direction="in"/></method>
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
    constructor(proxy) {
        this._proxy = proxy;
        this._tail = Promise.resolve();
    }

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

    _enqueue(action) {
        const call = this._tail.then(action);
        this._tail = call.catch(() => undefined);
        return call;
    }

    async listNotes() {
        const [payload] = await this._proxy.ListNotesAsync();
        return JSON.parse(payload);
    }

    async getView() {
        const [payload] = await this._proxy.GetViewAsync();
        return JSON.parse(payload);
    }

    createNote(title, content, x, y) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.CreateNoteAsync(title, content, x, y);
            return JSON.parse(payload);
        });
    }

    importImage(filePath, x, y) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.ImportImageAsync(filePath, x, y);
            return JSON.parse(payload);
        });
    }

    updateNote(id, title, content) {
        return this._enqueue(() => this._proxy.UpdateNoteAsync(id, title, content));
    }

    moveNote(id, x, y) {
        return this._enqueue(() => this._proxy.MoveNoteAsync(id, x, y));
    }

    updateGeometry(id, width, height, rotation) {
        return this._enqueue(() =>
            this._proxy.UpdateGeometryAsync(id, width, height, rotation));
    }

    duplicateImage(id, x, y) {
        return this._enqueue(async () => {
            const [payload] = await this._proxy.DuplicateImageAsync(id, x, y);
            return JSON.parse(payload);
        });
    }

    deleteNote(id) {
        return this._enqueue(() => this._proxy.DeleteNoteAsync(id));
    }

    saveView(zoom, panX, panY) {
        return this._enqueue(() => this._proxy.SaveViewAsync(zoom, panX, panY));
    }
}
