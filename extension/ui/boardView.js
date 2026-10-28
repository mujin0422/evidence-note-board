// Main GNOME Shell view/controller for the board.
//
// This is the only extension module that owns compositor actors and input
// signals. Pure geometry and persistence concerns stay in testable helpers;
// every resource created here must be released by destroy().
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {screenToWorld,boardDimensions,clampBoardCamera,zoomBoardAt,
    boardDragHasStarted,dragBoardView} from '../geometry/canvasMath.js';
import {TEXT_HOLD_MS, keepTextHold} from '../input/holdDrag.js';
import {confineNote, validBoardPoint} from '../geometry/boardBounds.js';
import {NoteService} from '../services/noteService.js';
import {DoubleClickTracker} from '../input/doubleClickTracker.js';
import {isEmptyBoardPoint,isEmptyTextEditorHit,isTextEditorHit} from '../input/noteHitTest.js';
import {hasLegacyTitle} from '../model/noteContent.js';
import {richTextForNote,encodeRichText,toggleBoldSpans,rebaseBoldSpans,
    rebaseBadges,insertBadge,CEFR_LEVELS,selectionIsBold,
    byteOffsetForCharacter,characterLength}
    from '../model/richText.js';
import {PIN_SIZE, pinPosition} from '../geometry/pinMath.js';
import {pinCenter, worldToScreen, menuNearPin, stringControlPoints, nearestTargetPin}
    from '../geometry/stringMath.js';
import {resizedTextWidth, resizedImage, requiredPaperHeight, gestureAt,
    pointerAngle, angleDelta, normalizeAngle, TEXT_HORIZONTAL_PADDING,
    TEXT_VERTICAL_PADDING, TEXT_VERTICAL_CHROME} from '../geometry/noteGeometry.js';
import {boundedImageDecodeSize} from '../geometry/imageSizing.js';
import {DEFAULT_PREFERENCES,singleScreenLayout,curveVisible,reconnectDelay}
    from '../core/runtimePolicy.js';

const INITIAL_VIEW = Object.freeze({zoom: 1, panX: 0, panY: 0});
const CARET_BLINK_MS = 530;
const PAPER_COLORS = Object.freeze(['#E9D898','#EFE2AD','#F4EBC6','#FAF6E4','#FFFFFF']);
const DARK_RED = '#7A1F1F';

export class BoardView {
    // Initialize state only; GNOME actors are created later by mount().
    constructor() {
        this._root = null;
        this._world = null;
        this._hud = null;
        this._imagePicker = null;
        this._settingsButton = null;
        this._settingsMenu = null;
        this._boards = [];
        this._activeBoardId = null;
        this._switchingBoard = false;
        this._loadSource = 0;
        this._preferences = {...DEFAULT_PREFERENCES};
        this._dirtyNotes = new Set();
        this._dirtyView = false;
        this._reconnectTimer = 0;
        this._reconnectAttempts = 0;
        this._paintTimer = 0;
        this._resizeTimer = 0;
        this._resizeSession = null;
        this._pinMenu = null;
        this._noteMenu = null;
        this._stringsLayer = null;
        this._connections = new Map();
        this._stringDraft = null;
        this._deletingNotes = new Set();
        this._doubleClick = new DoubleClickTracker();
        this._backgroundGroup = null;
        this._backgroundSignal = 0;
        this._stageSignals = [];
        this._grab = null;
        this._dragPoint = null;
        this._dragNote = null;
        this._boardPan = null;
        this._textHold = null;
        this._view = {...INITIAL_VIEW};
        this._boardSize = {width:8000,height:6000};
        this._notes = new Map();
        this._bodyNotes = new WeakMap();
        this._focusedBody = null;
        this._caretBlinkTimer = 0;
        this._timers = new Map();
        this._viewTimer = 0;
        this._service = null;
        this._backendWatchId = 0;
        this._connectionRevision = 0;
        this._alive = false;
        this._statusText = '';
    }

    // Attach the board to GNOME's background group and start backend discovery.
    mount() {
        const group = Main.layoutManager?._backgroundGroup;
        if (!group || typeof group.add_child !== 'function' ||
            typeof group.set_child_above_sibling !== 'function') {
            throw new Error('GNOME Shell background group is unsupported');
        }
        this._backgroundGroup = group;
        this._alive = true;

        this._root = new St.Widget({
            name: 'evidence-note-board',
            reactive: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'evidence-board-root',
        });
        this._world = new St.Widget({
            reactive: false,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._boardSize=boardDimensions(global.stage.width,global.stage.height);
        this._world.set_size(this._boardSize.width,this._boardSize.height);
        this._world.set_pivot_point(0, 0);
        this._root.add_child(this._world);
        // Screen-sized overlay is below the world actor (paper/pins).
        // The previous 4000x3000 world-space Cairo texture was oversized
        // and could fail to display on real GNOME Shell compositors.
        this._stringsLayer = new St.DrawingArea({
            reactive: false, style_class: 'evidence-strings-layer',
        });
        this._stringsLayer.connect('repaint', area => {
            try {
                this._paintStrings(area);
            } catch (error) {
                console.error(error, 'Evidence Note Board: red string repaint failed');
            }
        });
        this._root.add_child(this._stringsLayer);
        this._root.set_child_below_sibling(this._stringsLayer, this._world);

        this._hud = new St.Label({reactive: false, style_class: 'evidence-board-hud'});
        this._hud.set_position(22, 55);
        this._root.add_child(this._hud);

        // Double-click empty board for text; Ctrl+double-click for image.
        // Full-sized symbolic vector icon, aligned with the HUD.
        this._settingsButton = new St.Button({
            child: new St.Icon({
                icon_name: 'preferences-system-symbolic',
                icon_size: 22,
                style_class: 'evidence-settings-icon',
            }),
            reactive: true, can_focus: true,
            style_class: 'evidence-settings-button',
            accessible_name: 'Cài đặt Evidence Board',
        });
        this._settingsButton.connect('clicked',()=>this._toggleSettingsMenu());
        this._root.add_child(this._settingsButton);
        this._hud.connect('notify::width',()=>this._positionSettingsButton());
        this._hud.connect('notify::height',()=>this._positionSettingsButton());

        this._resize();
        this._setStatus('Đang kết nối backend…');

        this._root.connect('scroll-event', (_actor, event) => this._scroll(event));
        this._root.connect('button-press-event', (_actor, event) => this._press(event));
        this._root.connect('motion-event', (_actor, event) => this._motion(event));
        this._root.connect('button-release-event', (_actor, event) => this._release(event));

        group.add_child(this._root);
        this._raiseAboveWallpaper();
        this._backgroundSignal = group.connect('child-added', (_g, child) => {
            if (child !== this._root)
                this._raiseAboveWallpaper();
        });
        for (const name of ['notify::width', 'notify::height'])
            this._stageSignals.push(global.stage.connect(name, () => this._resize()));
        // Capturing at the Stage sees button release BEFORE a pin can consume
        // it. Fixes the cursor-stuck-to-pin regression at source.
        this._stageSignals.push(global.stage.connect('captured-event',
            (_actor, event) => this._capturedPointer(event)));
        // The Stage owns the actual keyboard focus. A background click or
        // another app taking focus must hide the old note's caret.
        this._stageSignals.push(global.stage.connect('notify::key-focus',
            () => this._syncCaretFocus()));

        // AUTO_START uses the per-user D-Bus activation entry if the
        // backend has not started yet. Name-owner changes make reconnection
        // automatic when systemd restarts it after a crash.
        this._backendWatchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            'io.github.mujin0422.EvidenceNoteBoard',
            Gio.BusNameWatcherFlags.AUTO_START,
            () => {
                if (!this._alive)
                    return;
                this._setStatus('Đang kết nối backend…');
                this._connectBackend().catch(error => {
                    if (this._alive) {
                        console.warn('Evidence Note Board: backend connection failed', error.message);
                        this._setStatus('BACKEND OFFLINE · đang thử kết nối lại');
                        this._scheduleReconnect();
                    }
                });
            },
            () => {
                if (!this._alive)
                    return;
                this._connectionRevision++;
                this._service = null;
                this._scheduleReconnect();
                // Preserve existing note actors and unsaved text on screen.
                this._setStatus('BACKEND OFFLINE · đang chờ tự kết nối lại');
            }
        );
    }

    // Hydrate preferences, camera, connections and notes from a fresh proxy.
    async _connectBackend() {
        const revision = ++this._connectionRevision;
        const service = await NoteService.connect();
        // Read the active-board selector before hydrating only its note data.
        const boardState = await service.listBoards();
        const [notes, view, connections, settings] = await Promise.all([
            service.listNotes(), service.getView(), service.listConnections(), service.getSettings(),
        ]);
        // A backend restart or extension disable invalidates in-flight RPCs.
        if (!this._alive || revision !== this._connectionRevision)
            return;
        if (this._activeBoardId !== boardState.active_board_id)
            this._clearBoardActors();
        this._activeBoardId = boardState.active_board_id;
        this._boards = boardState.boards;
        this._service = service;
        if (this._reconnectTimer) {
            GLib.Source.remove(this._reconnectTimer);
            this._reconnectTimer = 0;
        }
        this._reconnectAttempts = 0;
        this._preferences = settings;
        this._applyPreferences();
        this._connections = new Map(connections.map(c => [c.id, c]));
        this._queueStrings();
        // Preserve the camera's saved zoom and viewport; the screen is
        // only a window onto a much larger finite board.
        const requested=!this._dirtyView && Number.isFinite(view.zoom) &&
            Number.isFinite(view.pan_x) && Number.isFinite(view.pan_y)
            ? {zoom:view.zoom,panX:view.pan_x,panY:view.pan_y}
            : this._view;
        this._view=clampBoardCamera(requested,
            {width:global.stage.width,height:global.stage.height},this._boardSize);
        this._applyView();
        if (view.pan_x!==this._view.panX ||
            view.pan_y!==this._view.panY || view.zoom!==this._view.zoom)
            this._scheduleView();
        // A bounded batch per idle frame avoids a large synchronous actor spike.
        // Notes belonging to inactive boards are never requested or instantiated.
        this._renderNoteBatch(notes, revision);
        for (const id of [...this._dirtyNotes])
            this._flushNote(id);
        if (this._dirtyView)
            this._scheduleView();
    }

    // Release every Shell actor, image texture reference and stale callback.
    // The SQLite rows and image files are retained unmodified.
    _clearBoardActors() {
        if (this._loadSource) {
            GLib.Source.remove(this._loadSource);
            this._loadSource = 0;
        }
        this._stopCaretBlink();
        this._endBoardPan();
        this._cancelTextHold();
        this._cancelString();
        this._closeNoteMenu();
        this._closePinMenu();
        this._endDrag();
        global.stage.set_key_focus(null);
        for (const id of [...this._timers.keys()])
            this._cancelNoteTimer(id);
        if (this._viewTimer) {
            GLib.Source.remove(this._viewTimer);
            this._viewTimer = 0;
        }
        for (const item of this._notes.values()) {
            item.pin?.destroy();
            item.actor.destroy();
        }
        this._notes.clear();
        this._bodyNotes = new WeakMap();
        this._focusedBody = null;
        this._connections.clear();
        this._deletingNotes.clear();
        this._dirtyNotes.clear();
        this._dirtyView = false;
        this._doubleClick.reset();
        this._queueStrings(true);
    }

    _renderNoteBatch(notes, revision) {
        if (this._loadSource) {
            GLib.Source.remove(this._loadSource);
            this._loadSource = 0;
        }
        let index = 0, failed = 0;
        this._setStatus(`ĐANG TẢI ${notes.length} GHI CHÚ`);
        this._loadSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (!this._alive || revision !== this._connectionRevision) {
                this._loadSource = 0;
                return GLib.SOURCE_REMOVE;
            }
            const until = Math.min(index + 8, notes.length);
            for (; index < until; index++) {
                try {
                    this._renderNote(notes[index]);
                } catch (error) {
                    failed++;
                    console.error(error, 'Evidence Note Board: failed to render saved note');
                }
            }
            this._queueStrings();
            if (index < notes.length)
                return GLib.SOURCE_CONTINUE;
            this._loadSource = 0;
            this._setStatus(failed
                ? `LỖI HIỂN THỊ ${failed} GHI CHÚ · xem journalctl`
                : `SẴN SÀNG · ${notes.length} ghi chú · double-click: note`);
            return GLib.SOURCE_REMOVE;
        });
    }

    // Flush pending notes/camera before the selected board changes in SQLite.
    async _switchBoard(id) {
        if (!this._service || this._switchingBoard || id === this._activeBoardId)
            return;
        this._switchingBoard = true;
        this._closeSettingsMenu();
        const service = this._service;
        try {
            global.stage.set_key_focus(null);
            for (const noteId of [...this._dirtyNotes])
                this._flushNote(noteId);
            if (this._viewTimer) {
                GLib.Source.remove(this._viewTimer);
                this._viewTimer = 0;
            }
            if (this._dirtyView)
                this._persistView();
            await service.flushWrites();
            if (this._dirtyNotes.size)
                throw new Error('Unsaved notes prevent switching');
            if (!this._alive || service !== this._service)
                return;
            await service.selectBoard(id);
            if (!this._alive)
                return;
            // Invalidate any earlier connection/hydration callback.
            this._connectionRevision++;
            this._clearBoardActors();
            this._activeBoardId = null;
            this._setStatus('ĐANG CHUYỂN BOARD…');
            await this._connectBackend();
        } catch (error) {
            console.warn('Evidence Note Board: board switch failed', error.message);
            if (this._alive)
                this._setStatus('LỖI CHUYỂN BOARD · thử lại trong Settings');
        } finally {
            this._switchingBoard = false;
        }
    }

    async _createBoard() {
        if (!this._service || this._switchingBoard)
            return;
        try {
            const board = await this._service.createBoard();
            if (!this._alive)
                return;
            await this._switchBoard(board.id);
        } catch (error) {
            console.warn('Evidence Note Board: create board failed', error.message);
            this._saveError();
        }
    }

    async _renameBoard(id, entry) {
        if (!this._service || this._switchingBoard)
            return;
        try {
            const board = await this._service.renameBoard(id, entry.get_text());
            if (!this._alive)
                return;
            this._boards = this._boards.map(old => old.id === id ? board : old);
            this._closeSettingsMenu();
            this._setStatus(`ĐÃ ĐỔI TÊN · ${board.name}`);
        } catch (error) {
            console.warn('Evidence Note Board: rename board failed', error.message);
            this._setStatus('TÊN BOARD KHÔNG HỢP LỆ');
        }
    }

    // Retry a lost backend connection using bounded exponential backoff.
    _scheduleReconnect() {
        if (!this._alive || this._reconnectTimer || this._service)
            return;
        const delay = reconnectDelay(this._reconnectAttempts++);
        this._reconnectTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,delay,()=>{
            this._reconnectTimer=0;
            if (!this._alive || this._service)
                return GLib.SOURCE_REMOVE;
            this._connectBackend().catch(error=>{
                if (this._alive) {
                    console.warn('Evidence Note Board: reconnect failed',error.message);
                    this._scheduleReconnect();
                }
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    // Apply in-memory preferences to HUD and string visibility.
    _applyPreferences() {
        if (this._hud)
            this._hud.visible = this._preferences.show_hud;
        this._positionSettingsButton();
        // Force one redraw when hiding so Cairo clears the old wire surface.
        this._queueStrings(true);
    }

    // Apply preferences optimistically and roll back if persistence fails.
    _savePreferences(next) {
        if (!this._service) {
            this._setStatus('BACKEND OFFLINE · chưa thể lưu SETTINGS');
            return;
        }
        const previous=this._preferences;
        this._preferences=next;
        this._applyPreferences();
        this._closeSettingsMenu();
        this._service?.saveSettings(next).catch(error=>{
            console.warn('Evidence Note Board: settings not saved',error.message);
            this._preferences=previous;
            this._applyPreferences();
            this._setStatus('LỖI LƯU SETTINGS');
        });
    }

    // Destroy the screen-space settings popover if open.
    _closeSettingsMenu() {
        this._settingsMenu?.destroy();
        this._settingsMenu=null;
    }

    // Destroy the note/text context menu and release its actor references.
    _closeNoteMenu() {
        this._noteMenu?.destroy();
        this._noteMenu=null;
    }

    // Return the current non-empty character selection in ascending order.
    _textSelection(item) {
        const length=characterLength(item.body.get_text());
        const cursor=item.body.get_cursor_position();
        const bound=item.body.get_selection_bound();
        const a=cursor<0?length:cursor, b=bound<0?length:bound;
        return a===b?null:[Math.min(a,b),Math.max(a,b)];
    }

    // Apply a palette color immediately, then persist or roll back on error.
    _setPaperColor(item,color) {
        if (!PAPER_COLORS.includes(color) || !this._service)
            return;
        const previous=item.note.color;
        item.note.color=color;
        this._applyPaperColor(item);
        this._closeNoteMenu();
        this._service.updateColor(item.note.id,color).catch(()=>{
            item.note.color=previous;
            this._applyPaperColor(item);
            this._saveError();
        });
    }

    // Toggle the single supported dark-red foreground on the saved selection.
    _toggleSelectionDarkRed(item,selection=null) {
        selection??=this._textSelection(item);
        if (!selection)
            return;
        item.redSpans=toggleBoldSpans(item.redSpans,
            selection[0],selection[1],characterLength(item.body.get_text()));
        this._applyBoldAttributes(item);
        this._scheduleNote(item.note.id);
        this._closeNoteMenu();
    }

    // Insert one persisted CEFR badge at the current text cursor.
    _insertCefrBadge(item,level,insertionPosition=null) {
        const body=item.body;
        const length=characterLength(body.get_text());
        const cursor=body.get_cursor_position();
        const at=Number.isInteger(insertionPosition)
            ? insertionPosition : cursor<0?length:cursor;
        const result=insertBadge(body.get_text(),item.badges,at,level);
        body.set_text(result.text);
        item.badges=result.badges;
        item.lastText=result.text;
        body.set_cursor_position(result.cursor);
        body.set_selection_bound(result.cursor);
        this._applyBoldAttributes(item);
        this._scheduleNote(item.note.id);
        this._closeNoteMenu();
    }

    // Open paper-color actions and text-only formatting/badge actions.
    _openNoteMenu(item,event,withTextActions) {
        this._closeNoteMenu();
        this._closePinMenu();
        this._closeSettingsMenu();
        const menu=new St.BoxLayout({reactive:true,
            orientation:Clutter.Orientation.VERTICAL,
            style_class:'evidence-note-menu'});
        menu.add_child(new St.Label({text:'MÀU GIẤY',reactive:false,
            style_class:'evidence-note-menu-title'}));
        const colors=new St.BoxLayout({reactive:true,
            style_class:'evidence-note-menu-row'});
        for (const color of PAPER_COLORS) {
            const swatch=new St.Button({can_focus:true,
                accessible_name:`Màu giấy ${color}`,
                style_class:'evidence-paper-swatch',
                style:`background-color:${color};`});
            swatch.connect('clicked',()=>this._setPaperColor(item,color));
            colors.add_child(swatch);
        }
        menu.add_child(colors);
        if (withTextActions) {
            const selection=this._textSelection(item);
            if (selection) {
                const isRed=selectionIsBold(item.redSpans,
                    selection[0],selection[1]);
                const red=new St.Button({
                    label:isRed?'Chuyển về màu gốc':'Chữ đỏ thẫm',can_focus:true,
                    style_class:'evidence-note-menu-action'});
                red.connect('clicked',()=>this._toggleSelectionDarkRed(item,selection));
                menu.add_child(red);
            }
            menu.add_child(new St.Label({text:'CHÈN CẤP ĐỘ',reactive:false,
                style_class:'evidence-note-menu-title'}));
            const levels=new St.BoxLayout({reactive:true,
                style_class:'evidence-note-menu-row'});
            const insertionPosition=item.body.get_cursor_position();
            for (const level of CEFR_LEVELS) {
                const badge=new St.Button({label:level,can_focus:true,
                    style_class:'evidence-note-menu-action'});
                badge.connect('clicked',()=>this._insertCefrBadge(
                    item,level,insertionPosition));
                levels.add_child(badge);
            }
            menu.add_child(levels);
        }
        const close=new St.Button({label:'Đóng',can_focus:true,
            style_class:'evidence-note-menu-action'});
        close.connect('clicked',()=>this._closeNoteMenu());
        menu.add_child(close);
        const [x,y]=event.get_coords();
        const width=250;
        menu.set_width(width);
        this._root.add_child(menu);
        const [,naturalHeight]=menu.get_preferred_height(width);
        if (naturalHeight>0) menu.set_height(Math.ceil(naturalHeight));
        menu.set_position(
            Math.max(4,Math.min(this._root.width-width-4,x)),
            Math.max(4,Math.min(this._root.height-(naturalHeight||180)-4,y)));
        this._noteMenu=menu;
    }

    // Share popover positioning, retaining the compact Settings appearance.
    _showSettingsPopup(menu, popupWidth=334) {
        menu.set_width(popupWidth);
        this._root.add_child(menu);
        const [,naturalHeight]=menu.get_preferred_height(popupWidth);
        if (naturalHeight>0)
            menu.set_height(Math.ceil(naturalHeight));
        this._settingsMenu=menu;
        const [x,y]=this._settingsButton.get_position();
        const popupHeight=menu.height||naturalHeight||120;
        menu.set_position(
            Math.max(0,Math.min(this._root.width-popupWidth-8,x)),
            Math.max(0,Math.min(this._root.height-popupHeight-8,
                y+this._settingsButton.height+5)));
    }

    // Edit and delete are fixed-width icon buttons; the name is ellipsized,
    // not allowed to expand behind the scroll bar or be clipped as before.
    _toggleSettingsMenu() {
        if (this._settingsMenu) {
            this._closeSettingsMenu();
            return;
        }
        this._closeNoteMenu();
        this._closePinMenu();
        const menu=new St.BoxLayout({
            reactive:true,orientation:Clutter.Orientation.VERTICAL,
            style_class:'evidence-settings-menu',
        });
        const action=(label,callback,parent=menu)=>{
            const button=new St.Button({
                label,can_focus:true,style_class:'evidence-settings-action',
            });
            button.connect('clicked',callback);
            parent.add_child(button);
            return button;
        };
        const header=new St.BoxLayout({
            orientation:Clutter.Orientation.HORIZONTAL,
            style_class:'evidence-boards-header',
        });
        header.set_width(296);
        const title=new St.Label({
            text:'BOARDS',style_class:'evidence-board-section',
            y_align:Clutter.ActorAlign.CENTER,
        });
        title.set_height(26);
        header.add_child(title);
        header.add_child(new St.Widget({x_expand:true}));
        const addButton=new St.Button({
            label:'Thêm board',can_focus:true,
            style_class:'evidence-board-add-button',
            y_align:Clutter.ActorAlign.CENTER,
        });
        addButton.set_height(26);
        addButton.connect('clicked',()=>this._createBoard());
        header.add_child(addButton);
        menu.add_child(header);

        const scroll=new St.ScrollView({
            hscrollbar_policy:St.PolicyType.NEVER,
            vscrollbar_policy:St.PolicyType.AUTOMATIC,
            style_class:'evidence-boards-scroll',
        });
        scroll.set_width(304);
        const list=new St.BoxLayout({
            orientation:Clutter.Orientation.VERTICAL,
            style_class:'evidence-boards-list',
        });
        list.set_width(296);
        for (const board of this._boards) {
            const row=new St.BoxLayout({
                orientation:Clutter.Orientation.HORIZONTAL,
                style_class:'evidence-board-row',
            });
            row.set_width(296);
            const selected=board.id===this._activeBoardId;
            const nameLabel=new St.Label({
                text:`${selected?'● ':'○ '}${board.name} (${board.note_count})`,
                y_align:Clutter.ActorAlign.CENTER,
            });
            nameLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
            const nameButton=new St.Button({
                child:nameLabel,can_focus:true,style_class:'evidence-board-name-button',
                accessible_name:`Chọn board ${board.name}`,
            });
            nameButton.set_width(232);
            nameButton.set_height(30);
            nameButton.connect('clicked',()=>this._switchBoard(board.id));
            row.add_child(nameButton);

            const iconAction=(iconName,label,callback,disabled=false)=>{
                const button=new St.Button({
                    child:new St.Icon({icon_name:iconName,icon_size:14,
                        style_class:'evidence-board-action-icon'}),
                    can_focus:!disabled,reactive:!disabled,
                    style_class:disabled
                        ? 'evidence-board-icon-button evidence-board-icon-disabled'
                        : 'evidence-board-icon-button',
                    accessible_name:label,
                });
                button.set_size(28,30);
                if (!disabled)
                    button.connect('clicked',callback);
                row.add_child(button);
            };
            iconAction('document-edit-symbolic',`Đổi tên ${board.name}`,()=>{
                row.destroy_all_children();
                const entry=new St.Entry({
                    text:board.name,can_focus:true,
                    style_class:'evidence-board-name-entry',
                });
                entry.set_width(230);
                entry.set_height(30);
                row.add_child(entry);
                const save=action('Lưu',
                    ()=>this._renameBoard(board.id,entry),row);
                save.set_width(62);
                save.set_height(30);
                global.stage.set_key_focus(entry.clutter_text);
            });
            iconAction('user-trash-symbolic',`Xóa board ${board.name}`,
                ()=>this._confirmDeleteBoard(board),this._boards.length<=1);
            list.add_child(row);
        }
        scroll.set_child(list);
        scroll.set_height(Math.min(224,Math.max(36,this._boards.length*35)));
        menu.add_child(scroll);
        action(`HUD: ${this._preferences.show_hud?'Hiện':'Ẩn'}`,
            ()=>this._savePreferences({...this._preferences,
                show_hud:!this._preferences.show_hud})).set_width(296);
        action(`Dây đỏ: ${this._preferences.show_strings?'Hiện':'Ẩn'}`,
            ()=>this._savePreferences({...this._preferences,
                show_strings:!this._preferences.show_strings})).set_width(296);
        action('Đóng',()=>this._closeSettingsMenu()).set_width(296);
        this._showSettingsPopup(menu);
    }

    // Explicit confirmation is required before cascading any stored notes.
    _confirmDeleteBoard(board) {
        if (!this._service || this._switchingBoard || this._boards.length<=1)
            return;
        this._closeSettingsMenu();
        const menu=new St.BoxLayout({
            reactive:true,orientation:Clutter.Orientation.VERTICAL,
            style_class:'evidence-settings-menu evidence-board-confirm-menu',
        });
        const title=new St.Label({
            text:`Xóa board "${board.name}"?`,
            style_class:'evidence-board-confirm-title',
        });
        title.set_width(296);
        title.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        menu.add_child(title);
        const detail=new St.Label({
            text:`Xóa vĩnh viễn ${board.note_count} ghi chú, ảnh và dây đỏ của board này.`,
            style_class:'evidence-board-confirm-detail',
        });
        detail.set_width(296);
        detail.clutter_text.set_line_wrap(true);
        menu.add_child(detail);
        const actions=new St.BoxLayout({
            orientation:Clutter.Orientation.HORIZONTAL,
            style_class:'evidence-board-confirm-actions',
        });
        const deleteButton=new St.Button({
            label:'Xóa board',can_focus:true,
            style_class:'evidence-board-confirm-delete',
        });
        deleteButton.set_width(144);
        deleteButton.connect('clicked',()=>this._deleteBoard(board.id));
        actions.add_child(deleteButton);
        const cancelButton=new St.Button({
            label:'Hủy',can_focus:true,
            style_class:'evidence-settings-action',
        });
        cancelButton.set_width(144);
        cancelButton.connect('clicked',()=>{
            this._closeSettingsMenu();
            this._toggleSettingsMenu();
        });
        actions.add_child(cancelButton);
        menu.add_child(actions);
        this._showSettingsPopup(menu);
    }

    // Save pending edits before a destructive operation, then refresh metadata
    // without rebuilding notes if the deleted board was not active.
    async _deleteBoard(id) {
        if (!this._service || this._switchingBoard || this._boards.length<=1)
            return;
        this._switchingBoard=true;
        this._closeSettingsMenu();
        const service=this._service;
        const wasActive=id===this._activeBoardId;
        try {
            global.stage.set_key_focus(null);
            for (const noteId of [...this._dirtyNotes])
                this._flushNote(noteId);
            if (this._viewTimer) {
                GLib.Source.remove(this._viewTimer);
                this._viewTimer=0;
            }
            if (this._dirtyView)
                this._persistView();
            await service.flushWrites();
            if (this._dirtyNotes.size)
                throw new Error('Unsaved note edits prevent board deletion');
            if (!this._alive || service!==this._service)
                return;
            const activeId=await service.deleteBoard(id);
            if (!this._alive || service!==this._service)
                return;
            if (wasActive) {
                this._connectionRevision++;
                this._clearBoardActors();
                this._activeBoardId=null;
                await this._connectBackend();
            } else {
                const boards=await service.listBoards();
                if (!this._alive || service!==this._service)
                    return;
                this._activeBoardId=activeId;
                this._boards=boards.boards;
                this._setStatus('ĐÃ XÓA BOARD');
            }
        } catch (error) {
            console.warn('Evidence Note Board: delete board failed',error.message);
            if (this._alive)
                this._setStatus('LỖI XÓA BOARD · kiểm tra dữ liệu và thử lại');
        } finally {
            this._switchingBoard=false;
        }
    }

    // Keep the settings button aligned immediately left of the HUD.
    _positionSettingsButton() {
        if (!this._hud || !this._settingsButton || !this._root)
            return;
        // Both actors use the same natural HUD height; Settings is a
        // square placed to the LEFT of the HUD, not the previous large
        // 55px button. Keep the HUD clickable region out of the button.
        const [,naturalHeight]=this._hud.get_preferred_height(-1);
        const height=Math.max(28,Math.ceil(naturalHeight||this._hud.height||34));
        if (this._settingsButton.width!==height ||
            this._settingsButton.height!==height)
            this._settingsButton.set_size(height,height);
        const left=22,top=55,gap=7;
        this._settingsButton.set_position(left,top);
        this._hud.set_position(left+height+gap,top);
    }

    // Render a status message together with the current zoom percentage.
    _setStatus(message) {
        const board=this._boards.find(b=>b.id===this._activeBoardId)?.name ?? 'BOARD';
        const text=`${board.slice(0,28)} · ${message} · ${Math.round(this._view.zoom * 100)}%`;
        // Pan motion can run at the display refresh rate. Avoid relayout and
        // notify::width/height emissions when the visible label is unchanged.
        if (text===this._statusText)
            return;
        this._statusText=text;
        this._hud?.set_text(text);
        this._positionSettingsButton();
    }

    // Keep the board above wallpaper actors but below normal application UI.
    _raiseAboveWallpaper() {
        if (this._root?.get_parent() === this._backgroundGroup)
            this._backgroundGroup.set_child_above_sibling(this._root, null);
    }

    // React to stage-size changes without rewriting note coordinates.
    _resize() {
        if (this._root)
            this._root.set_size(global.stage.width, global.stage.height);
        // Single-screen mode: toolbar remains at fixed stage coordinates.
        const c=singleScreenLayout(global.stage.width,global.stage.height);
        this._hud?.set_position(c.hud.x,c.hud.y);
        this._positionSettingsButton();
        this._closeSettingsMenu();
        this._closeNoteMenu();
        if (this._stringsLayer) {
            this._stringsLayer.set_size(global.stage.width, global.stage.height);
            this._queueStrings();
        }
        // Resize the canvas (if necessary), then clamp the viewport
        // only. Never move/save all note coordinates on a display resize.
        if (this._resizeTimer)
            GLib.Source.remove(this._resizeTimer);
        this._resizeTimer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,150,()=>{
            this._resizeTimer=0;
            if (this._alive && global.stage.width >= 400 && global.stage.height >= 300) {
                this._boardSize=boardDimensions(global.stage.width,
                    global.stage.height,this._boardSize);
                this._world?.set_size(this._boardSize.width,this._boardSize.height);
                const camera=clampBoardCamera(this._view,
                    {width:global.stage.width,height:global.stage.height},
                    this._boardSize);
                if (camera.panX!==this._view.panX ||
                    camera.panY!==this._view.panY) {
                    this._view=camera;
                    this._applyView();
                    this._scheduleView();
                }
            }
            return GLib.SOURCE_REMOVE;
        });
        this._positionPinMenu();
    }

    // Apply camera transforms and reposition dependent screen-space UI.
    _applyView() {
        if (!this._world)
            return;
        this._world.set_scale(this._view.zoom,this._view.zoom);
        this._world.set_position(this._view.panX,this._view.panY);
        if (this._service)
            this._setStatus('Ctrl+Wheel: zoom · kéo nền trống: di chuyển khung nhìn');
        this._positionPinMenu();
        this._queueStrings();
    }

    // Debounce camera persistence while marking it dirty for reconnects.
    _scheduleView() {
        if (!this._alive)
            return;
        this._dirtyView=true;
        if (!this._service)
            return;
        if (this._viewTimer)
            GLib.Source.remove(this._viewTimer);
        this._viewTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 550, () => {
            this._viewTimer = 0;
            this._persistView();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Save one camera snapshot and clear dirty state only if still current.
    _persistView() {
        if (!this._service)
            return;
        const {zoom, panX, panY} = this._view;
        this._service.saveView(zoom, panX, panY).then(()=>{
            if (this._alive && this._view.zoom===zoom &&
                this._view.panX===panX && this._view.panY===panY)
                this._dirtyView=false;
        }).catch(()=>{
            this._dirtyView=true;
            this._saveError();
        });
    }

    // Surface persistence failure without logging private note content.
    _saveError() {
        if (this._alive)
            this._setStatus('LỖI LƯU · kiểm tra user service');
    }

    // Handle Ctrl+wheel cursor-anchored zoom.
    _scroll(event) {
        if (!this._service ||
            !(event.get_state() & Clutter.ModifierType.CONTROL_MASK))
            return Clutter.EVENT_PROPAGATE;
        const direction=event.get_scroll_direction();
        let factor;
        if (direction===Clutter.ScrollDirection.UP)
            factor=1.1;
        else if (direction===Clutter.ScrollDirection.DOWN)
            factor=1/1.1;
        else if (direction===Clutter.ScrollDirection.SMOOTH) {
            const [,dy]=event.get_scroll_delta();
            factor=Math.exp(-dy*0.13);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        if (!Number.isFinite(factor) || factor<=0)
            return Clutter.EVENT_PROPAGATE;
        const [x,y]=event.get_coords();
        // Zoom BOARD around cursor. Distant notes may go offscreen:
        // they remain inside the board at unchanged world coordinates.
        const next=zoomBoardAt(this._view,{x,y},
            this._view.zoom*factor,
            {width:global.stage.width,height:global.stage.height},
            this._boardSize);
        if (Math.abs(next.zoom-this._view.zoom)<0.00001)
            return Clutter.EVENT_STOP;
        this._view=next;
        this._applyView();
        this._scheduleView();
        return Clutter.EVENT_STOP;
    }

    // Clamp one note to finite world bounds and optionally persist corrections.
    _confineGeometry(note,persist=false) {
        if (!(this._boardSize.width>0 && this._boardSize.height>0))
            return;
        const previous={x:note.x,y:note.y,width:note.width,height:note.height};
        // Only clamp to WORLD boundaries, never to the on-screen viewport.
        const fixed=confineNote(note,this._boardSize.width,this._boardSize.height,1);
        Object.assign(note,{x:fixed.x,y:fixed.y,
            width:fixed.width,height:fixed.height});
        if (persist && this._service) {
            if (note.x!==previous.x || note.y!==previous.y)
                this._service.moveNote(note.id,note.x,note.y)
                    .catch(()=>this._saveError());
            if (note.width!==previous.width || note.height!==previous.height)
                this._service.updateGeometry(note.id,note.width,note.height,note.rotation)
                    .catch(()=>this._saveError());
        }
    }

    // Convert a screen click to world space and create a text note.
    _createNoteAtScreen(x, y) {
        if (!this._alive || !this._service) {
            this._setStatus('BACKEND OFFLINE · kiểm tra user service');
            return;
        }
        if (!validBoardPoint({x,y},global.stage.width,global.stage.height))
            return;
        const at = screenToWorld(this._view, {x, y});
        this._setStatus('Đang tạo ghi chú…');
        this._service.createNote('', '', at.x, at.y)
            .then(note => {
                if (!this._alive)
                    return;
                // Persistence is already committed. A render error must never
                // be reported as a failed save (otherwise users create
                // multiple invisible records by retrying).
                try {
                    this._renderNote(note, true);
                    this._setStatus('ĐÃ TẠO GHI CHÚ · nhập trực tiếp trên giấy');
                } catch (error) {
                    console.error(error, 'Evidence Note Board: saved note but rendering failed');
                    this._setStatus('ĐÃ LƯU NHƯNG LỖI HIỂN THỊ · xem journalctl');
                }
            })
            .catch(error => {
                console.warn('Evidence Note Board: create note D-Bus failed', error.message);
                this._setStatus('LỖI TẠO GHI CHÚ QUA D-BUS · xem journalctl');
            });
    }

    // Open the native file chooser and import the selected image asynchronously.
    async _chooseImage(screenPoint=null) {
        if (!this._service || !this._alive) {
            this._setStatus('BACKEND OFFLINE · không thể nhập ảnh');
            return;
        }
        if (this._imagePicker)
            return;
        if (!GLib.find_program_in_path('zenity')) {
            this._setStatus('Cần cài Zenity · sudo dnf install zenity');
            return;
        }

        try {
            // Native GTK file-picker process, NOT an overlay or GNOME Shell
            // synchronous file chooser. It does not block compositor input.
            const process = Gio.Subprocess.new([
                'zenity', '--file-selection',
                '--title=Nhập ảnh vào Evidence Note Board',
                '--file-filter=Images | *.png *.PNG *.jpg *.jpeg *.JPG *.JPEG *.webp *.WEBP',
            ], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._imagePicker = process;
            const [ok, stdout] = await new Promise((resolve, reject) => {
                process.communicate_utf8_async(null, null, (proc, result) => {
                    try {
                        resolve(proc.communicate_utf8_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (!this._alive || this._imagePicker !== process)
                return;
            if (!ok || !process.get_successful())
                return; // User cancelled; no error.
            const selected = stdout.trim();
            if (!selected)
                return;
            const point=screenPoint ??
                singleScreenLayout(global.stage.width,global.stage.height).center;
            const at=screenToWorld(this._view,point);
            this._setStatus('Đang nhập ảnh vào bộ nhớ cục bộ…');
            const note = await this._service.importImage(selected, at.x, at.y);
            if (!this._alive)
                return;
            try {
                this._renderNote(note);
                this._setStatus('PHASE 3 · ĐÃ NHẬP ẢNH VÀO SQLITE');
            } catch (error) {
                console.error(error, 'Evidence Note Board: image saved but render failed');
                this._setStatus('ẢNH ĐÃ LƯU, LỖI HIỂN THỊ · xem journalctl');
            }
        } catch (error) {
            if (this._alive) {
                console.warn('Evidence Note Board: image import failed', error.message);
                this._setStatus('LỖI NHẬP ẢNH · kiểm tra Zenity và backend');
            }
        } finally {
            this._imagePicker = null;
        }
    }

    // Apply only position-dependent state during a drag, avoiding relayout.
    _applyPosition(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        this._confineGeometry(note);
        item.actor.set_position(note.x,note.y);
        if (item.pin) {
            const point = pinPosition(note);
            item.pin.set_position(point.x, point.y);
        }
        if (this._pinMenu?.noteId === note.id)
            this._positionPinMenu();
        this._queueStrings();
    }

    // Apply a note model's complete size and rotation to its actors.
    _applyGeometry(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        this._applyPosition(note);
        item.actor.set_size(note.width, note.height);
        item.actor.set_pivot_point(0.5, 0.5);
        item.actor.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, note.rotation);
        if (note.type === 'image') {
            item.photo?.set_size(Math.max(60, note.width - 24),
                Math.max(60, note.height - 48));
        } else if (item.body) {
            item.body.set_position(TEXT_HORIZONTAL_PADDING,TEXT_VERTICAL_PADDING);
            item.body.set_size(
                Math.max(120,note.width-TEXT_HORIZONTAL_PADDING*2),
                Math.max(1,note.height-TEXT_VERTICAL_CHROME));
            this._renderBadges(item);
        }
    }

    // Write geometry only when it differs from the last successful snapshot.
    _persistGeometry(note) {
        const item=this._notes.get(note.id);
        if (!item || !this._service)
            return Promise.resolve();
        const next={width:note.width,height:note.height,rotation:note.rotation};
        const old=item.persistedGeometry;
        if (old && old.width===next.width && old.height===next.height &&
            old.rotation===next.rotation)
            return Promise.resolve();
        return this._service.updateGeometry(note.id,next.width,next.height,next.rotation)
            .then(()=>{
                if (this._alive && this._notes.get(note.id)===item)
                    item.persistedGeometry=next;
            });
    }

    // Keep the actor and inline CEFR badges on the persisted paper color.
    _applyPaperColor(item) {
        const color=PAPER_COLORS.includes(item.note.color)
            ? item.note.color : PAPER_COLORS[0];
        item.actor.set_style(`background-color:${color};`);
        for (const badge of item.badgeActors??[])
            badge.set_style(`background-color:${color};`);
        this._applyBoldAttributes(item);
    }

    // Position rounded CEFR labels over their reserved inline placeholders.
    _renderBadges(item) {
        for (const actor of item.badgeActors??[])
            actor.destroy();
        item.badgeActors=[];
        const layout=item.body.get_layout();
        if (!layout)
            return;
        const paperColor=PAPER_COLORS.includes(item.note.color)
            ? item.note.color : PAPER_COLORS[0];
        for (const badge of item.badges) {
            try {
                const rect=layout.index_to_pos(
                    byteOffsetForCharacter(item.body.get_text(),badge.at));
                const actor=new St.Label({text:badge.level,reactive:false,
                    style_class:'evidence-cefr-badge',
                    style:`background-color:${paperColor};`});
                item.actor.add_child(actor);
                actor.set_position(
                    TEXT_HORIZONTAL_PADDING+Math.floor(rect.x/Pango.SCALE),
                    TEXT_VERTICAL_PADDING+Math.floor(rect.y/Pango.SCALE));
                item.badgeActors.push(actor);
            } catch (error) {
                console.warn('Evidence Note Board: cannot position CEFR badge',error.message);
            }
        }
    }

    // Convert character-based formatting spans into Pango byte attributes.
    _applyBoldAttributes(item) {
        if (!item?.body)
            return;
        const list=new Pango.AttrList();
        const text=item.body.get_text();
        for (const [start,end] of item.boldSpans) {
            const attribute=Pango.attr_weight_new(Pango.Weight.BOLD);
            attribute.start_index=byteOffsetForCharacter(text,start);
            attribute.end_index=byteOffsetForCharacter(text,end);
            list.insert(attribute);
        }
        for (const [start,end] of item.redSpans) {
            const red=DARK_RED.slice(1).match(/../g)
                .map(value=>parseInt(value,16)*257);
            const attribute=Pango.attr_foreground_new(...red);
            attribute.start_index=byteOffsetForCharacter(text,start);
            attribute.end_index=byteOffsetForCharacter(text,end);
            list.insert(attribute);
        }
        const paperColor=PAPER_COLORS.includes(item.note.color)
            ? item.note.color : PAPER_COLORS[0];
        const rgb=paperColor.slice(1).match(/../g).map(value=>parseInt(value,16)*257);
        for (const badge of item.badges) {
            const attribute=Pango.attr_foreground_new(...rgb);
            attribute.start_index=byteOffsetForCharacter(text,badge.at);
            attribute.end_index=byteOffsetForCharacter(text,badge.at+1);
            list.insert(attribute);
            // Reserve enough visual width for the overlaid two-letter badge
            // without storing extra deletable spaces in the user's text.
            const spacing=Pango.attr_letter_spacing_new(15*Pango.SCALE);
            spacing.start_index=attribute.start_index;
            spacing.end_index=attribute.end_index;
            list.insert(spacing);
        }
        item.body.set_attributes(list);
        this._renderBadges(item);
    }

    // Toggle bold for the editor's current selection.
    _toggleBoldOnSelection(item) {
        const body=item.body;
        const text=body.get_text();
        const length=characterLength(text);
        const cursor=body.get_cursor_position();
        const selection=body.get_selection_bound();
        const a=cursor<0?length:cursor;
        const b=selection<0?length:selection;
        if (!body.get_selection() || a===b)
            return; // No highlight: keep the text completely unchanged.
        item.boldSpans=toggleBoldSpans(item.boldSpans,
            Math.min(a,b),Math.max(a,b),length);
        this._applyBoldAttributes(item);
        this._syncTextHeight(item.note);
        this._scheduleNote(item.note.id);
    }

    // Grow text paper to its measured content height and keep it on-board.
    _syncTextHeight(note) {
        const item = this._notes.get(note.id);
        if (!item?.body || !this._alive)
            return;
        // Preferred height measures the unconstrained wrapped content. Using
        // get_pixel_size() here would read the already allocated body height,
        // causing a feedback loop that could grow but never shrink.
        const width=Math.max(120,note.width-TEXT_HORIZONTAL_PADDING*2);
        // Remove the explicit old paper height before asking Clutter for its
        // natural wrapped height; otherwise it reports the existing allocation
        // and newly typed lines can be clipped below the paper.
        item.body.set_width(width);
        item.body.set_height(-1);
        const [,naturalHeight]=item.body.get_preferred_height(width);
        const required=Math.min(requiredPaperHeight(naturalHeight),
            Math.max(110,this._boardSize.height-60));
        if (note.height !== required) {
            note.height = required;
            this._applyGeometry(note);
            this._scheduleNote(note.id);
        } else
            item.body.set_height(Math.max(1,note.height-TEXT_VERTICAL_CHROME));
    }

    // Create the independent pushpin actor and bind its pointer actions.
    _installPin(note) {
        const item = this._notes.get(note.id);
        if (!item)
            return;
        // A separate world actor prevents paper resize/edit handlers from
        // intercepting pin drag or its right-click context menu.
        const pin = new St.Widget({
            reactive: true, can_focus: true,
            layout_manager: new Clutter.FixedLayout(),
            style_class: 'evidence-pin-hit-area',
        });
        pin.set_size(PIN_SIZE, PIN_SIZE);
        for (const [style, x, y, width, height] of [
            ['evidence-pin-stem', 18, 25, 4, 13],
            ['evidence-pin-shadow', 5, 4, 31, 30],
            ['evidence-pin-metal', 6, 3, 28, 28],
            ['evidence-pin-head', 9, 6, 22, 22],
            ['evidence-pin-glint', 13, 9, 7, 5],
        ]) {
            const layer = new St.Widget({reactive: false, style_class: style});
            layer.set_size(width, height);
            layer.set_position(x, y);
            pin.add_child(layer);
        }
        pin.connect('button-press-event', (_actor, event) => {
            this._doubleClick.reset();
            if (event.get_button() === 1) {
                this._closePinMenu();
                // Shift+drag from pin A onto pin B OR Shift+click A then
                // click B adds a red string. Both modes are supported.
                if (this._stringDraft) {
                    if (note.id !== this._stringDraft.sourceId)
                        this._completeString(note.id);
                    else
                        this._cancelString();
                    return Clutter.EVENT_STOP;
                }
                if (event.get_state() & Clutter.ModifierType.SHIFT_MASK) {
                    this._startString(note, event);
                    return Clutter.EVENT_STOP;
                }
                return this._startNoteDrag(event, note);
            }
            if (event.get_button() === 3) {
                this._togglePinMenu(note);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_STOP;
        });
        pin.connect('button-release-event', () => Clutter.EVENT_STOP);
        item.pin = pin;
        this._world.add_child(pin);
        const point = pinPosition(note);
        pin.set_position(point.x, point.y);
    }

    // Destroy the active pin action popover.
    _closePinMenu() {
        if (!this._pinMenu)
            return;
        this._pinMenu.actor.destroy();
        this._pinMenu = null;
    }

    // Anchor the pin popover in screen space so it does not scale with zoom.
    _positionPinMenu() {
        if (!this._pinMenu || !this._root)
            return;
        const {actor, noteId} = this._pinMenu;
        const note = this._notes.get(noteId)?.note;
        if (!note)
            return;
        const point = menuNearPin(note, this._view,
            {width: this._root.width, height: this._root.height},
            actor.width, actor.height);
        actor.set_position(point.x, point.y);
    }

    // Open or close actions for a specific note pin.
    _togglePinMenu(note) {
        if (this._pinMenu?.noteId === note.id) {
            this._closePinMenu();
            return;
        }
        this._closeNoteMenu();
        this._closePinMenu();
        this._cancelString();
        // IMPORTANT: menu is a SCREEN-SPACE overlay. It is not scaled or
        // translated by _world, so the pin-to-menu gap is always 5 px.
        const menu = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-pin-menu',
        });
        const related = [...this._connections.values()].filter(c =>
            c.source_note_id === note.id || c.target_note_id === note.id);
        menu.add_child(new St.Label({
            text: note.type === 'image' ? 'ẢNH ĐÃ GHIM' : 'GHI CHÚ ĐÃ GHIM',
            reactive: false, style_class: 'evidence-pin-menu-title',
        }));
        // Removing a STRING does not delete either endpoint.
        for (let i = 0; i < Math.min(related.length, 6); i++) {
            const connection = related[i];
            const detach = new St.Button({
                label: `Tháo dây đỏ #${i + 1}`,
                can_focus: true, style_class: 'evidence-pin-cancel',
            });
            detach.connect('clicked', () => this._removeString(connection.id));
            menu.add_child(detach);
        }
        const remove = new St.Button({
            label: note.type === 'image' ? 'Xóa ảnh' : 'Xóa ghi chú',
            can_focus: true, style_class: 'evidence-pin-delete',
        });
        let armed = false;
        remove.connect('clicked', () => {
            if (!armed) {
                armed = true;
                remove.set_label('Xác nhận xóa');
                remove.add_style_pseudo_class('confirm');
                return;
            }
            this._deletePinnedNote(note);
        });
        menu.add_child(remove);
        const cancel = new St.Button({
            label: 'Hủy', can_focus: true, style_class: 'evidence-pin-cancel',
        });
        cancel.connect('clicked', () => this._closePinMenu());
        menu.add_child(cancel);
        menu.set_size(198, 118 + 34 * Math.min(related.length, 6));
        this._root.add_child(menu);
        this._pinMenu = {noteId: note.id, actor: menu};
        this._positionPinMenu();
    }

    // Begin a temporary red string from one note pin.
    _startString(note, event) {
        const [x, y] = event.get_coords();
        this._stringDraft = {sourceId: note.id,
            target: {x: (x - this._view.panX) / this._view.zoom,
                y: (y - this._view.panY) / this._view.zoom}};
        this._setStatus('DÂY ĐỎ · kéo sang pin khác hoặc nhấp pin đích · Esc hủy');
        this._queueStrings();
    }

    // Cancel the in-progress string and repaint without the preview.
    _cancelString() {
        if (!this._stringDraft)
            return;
        this._stringDraft = null;
        this._queueStrings();
    }

    // Persist a draft string once it reaches a valid target pin.
    _completeString(targetId) {
        const draft = this._stringDraft;
        if (!draft || draft.sourceId === targetId || !this._service)
            return;
        this._cancelString();
        this._service.createConnection(draft.sourceId, targetId)
            .then(edge => {
                if (!this._alive) return;
                this._connections.set(edge.id, edge);
                this._queueStrings();
                this._setStatus('PHASE 4 · ĐÃ LƯU LIÊN KẾT · dây đỏ trên board');
            }).catch(error => {
                console.warn('Evidence Board: could not save string', error.message);
                if (this._alive)
                    this._setStatus('LỖI NỐI DÂY · xem journalctl');
            });
    }

    // Remove a persisted connection and update the drawing layer.
    _removeString(id) {
        if (!this._service)
            return;
        this._service.deleteConnection(id).then(() => {
            if (!this._alive) return;
            this._connections.delete(id);
            this._closePinMenu();
            this._queueStrings();
            this._setStatus('PHASE 4 · ĐÃ THÁO DÂY ĐỎ');
        }).catch(() => this._saveError());
    }

    // Coalesce multiple red-string repaint requests into one idle callback.
    _queueStrings(force=false) {
        // A disabled wire layer needs one forced repaint to clear old pixels,
        // then camera/note motion can skip all further Cairo work.
        if (!force && !this._preferences.show_strings)
            return;
        if (!this._alive || !this._stringsLayer || this._paintTimer)
            return;
        this._paintTimer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,16,()=>{
            this._paintTimer=0;
            if (this._alive)
                this._stringsLayer?.queue_repaint();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Paint visible saved and draft strings onto the stage-sized Cairo layer.
    _paintStrings(area) {
        const cr = area.get_context();
        try {
            const draw = (a, b, isDraft = false) => {
                const g = stringControlPoints(a, b);
                cr.moveTo(g.a.x, g.a.y);
                cr.curveTo(g.c1.x, g.c1.y, g.c2.x, g.c2.y, g.b.x, g.b.y);
                cr.setSourceRGBA(0.12, 0.015, 0.015, 0.8);
                cr.setLineWidth(isDraft ? 4.6 : 5.2);
                cr.strokePreserve();
                cr.setSourceRGBA(0.72, 0.08, 0.09, isDraft ? 0.68 : 0.96);
                cr.setLineWidth(isDraft ? 2.2 : 2.8);
                cr.stroke();
            };
            const project = point => worldToScreen(this._view, point);
            if (!this._preferences.show_strings)
                return;
            const viewport={width:area.width,height:area.height};
            for (const edge of this._connections.values()) {
                const a = this._notes.get(edge.source_note_id)?.note;
                const b = this._notes.get(edge.target_note_id)?.note;
                if (a && b) {
                    const from=project(pinCenter(a));
                    const to=project(pinCenter(b));
                    if (curveVisible(from,to,viewport))
                        draw(from,to);
                }
            }
            if (this._stringDraft) {
                const start = this._notes.get(this._stringDraft.sourceId)?.note;
                if (start)
                    draw(project(pinCenter(start)),
                        project(this._stringDraft.target), true);
            }
        } finally {
            cr.$dispose();
        }
    }

    // Require a second explicit action before deleting a pinned note.
    _deletePinnedNote(note) {
        if (!this._service || !this._alive || this._deletingNotes.has(note.id))
            return;
        const id = note.id;
        this._deletingNotes.add(id);
        // NoteService serializes queued UpdateNote/UpdateGeometry/DeleteNote.
        this._flushNote(id);
        this._service.deleteNote(id).then(() => {
            if (!this._alive)
                return;
            this._closePinMenu();
            this._cancelNoteTimer(id);
            for (const [edgeId, edge] of this._connections) {
                if (edge.source_note_id === id || edge.target_note_id === id)
                    this._connections.delete(edgeId);
            }
            if (this._stringDraft?.sourceId === id)
                this._cancelString();
            this._queueStrings();
            const item = this._notes.get(id);
            if (item) {
                if (item.body && this._focusedBody===item.body) {
                    global.stage.set_key_focus(null);
                    this._stopCaretBlink();
                }
                item.pin?.destroy();
                item.actor.destroy();
                this._notes.delete(id);
            }
            this._setStatus('PHASE 4 · đã xóa qua pin');
        }).catch(error => {
            console.warn('Evidence Note Board: pin deletion failed', error.message);
            if (this._alive)
                this._setStatus('LỖI XÓA QUA D-BUS · xem journalctl');
        }).finally(() => this._deletingNotes.delete(id));
    }

    // Build a non-editable Polaroid actor for an imported local image.
    _renderImageNote(note) {
        if (!this._alive || this._notes.has(note.id))
            return;
        this._confineGeometry(note,true);
        if (!note.asset_path)
            throw new Error('Image note has no local asset path');
        const paper = new St.BoxLayout({
            reactive: true,
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'evidence-photo',
        });
        paper.set_size(note.width, note.height);
        paper.set_position(note.x, note.y);
        // Icons are square by design. Use an image texture and aspect
        // gravity instead so wide/tall photographs retain their shape.
        const texture = St.TextureCache.get_default();
        const file = Gio.File.new_for_path(note.asset_path);
        const paintScale = St.ThemeContext.get_for_stage(global.stage).scaleFactor;
        const photoWidth=Math.max(60,note.width-24);
        const photoHeight=Math.max(60,note.height-48);
        const decodeSize=boundedImageDecodeSize(photoWidth,photoHeight,paintScale);
        // Decode near the displayed size instead of retaining the original
        // multi-megapixel bitmap inside the long-lived gnome-shell process.
        // Large resized cards are capped to a predictable texture budget.
        const photo = texture.load_file_async(file,
            decodeSize.width,decodeSize.height,paintScale,1.0);
        photo.set_content_gravity(Clutter.ContentGravity.RESIZE_ASPECT);
        photo.set_reactive(false);
        photo.set_size(photoWidth,photoHeight);
        paper.add_child(photo);

        this._notes.set(note.id, {note, actor: paper, photo,
            persistedGeometry:{width:note.width,height:note.height,
                rotation:note.rotation}});
        this._world.add_child(paper);
        this._connectPaperGestures(paper, note);
        this._installPin(note);
        this._applyGeometry(note);
    }

    // Interpret blank-board presses as create gestures or pending camera pans.
    _press(event) {
        if (!this._service)
            return Clutter.EVENT_PROPAGATE;
        if (event.get_button()!==1) {
            this._doubleClick.reset();
            return Clutter.EVENT_PROPAGATE; // No middle-button pan.
        }
        const [x,y]=event.get_coords();
        if (!validBoardPoint({x,y},global.stage.width,global.stage.height))
            return Clutter.EVENT_PROPAGATE;
        if (this._pinMenu) {
            const {actor}=this._pinMenu;
            const inside=x>=actor.x && y>=actor.y &&
                x<=actor.x+actor.width && y<=actor.y+actor.height;
            if (inside) {
                this._doubleClick.reset();
                return Clutter.EVENT_PROPAGATE;
            }
            this._closePinMenu();
        }
        if (this._noteMenu) {
            const actor=this._noteMenu;
            const inside=x>=actor.x && y>=actor.y &&
                x<=actor.x+actor.width && y<=actor.y+actor.height;
            if (inside) {
                this._doubleClick.reset();
                return Clutter.EVENT_PROPAGATE;
            }
            this._closeNoteMenu();
        }
        const uiRects=[];
        // The HUD is non-interactive, only Settings excludes gestures.
        for (const actor of [this._settingsButton,this._settingsMenu,this._noteMenu]) {
            if (!actor)
                continue;
            const [ax,ay]=actor.get_position();
            const [width,height]=actor.get_size();
            uiRects.push({x:ax,y:ay,width,height});
        }
        const notes=[...this._notes.values()].map(item=>item.note);
        if (!isEmptyBoardPoint(this._view,{x,y},notes,uiRects)) {
            this._doubleClick.reset();
            return Clutter.EVENT_PROPAGATE;
        }
        const mode=event.get_state() & Clutter.ModifierType.CONTROL_MASK
            ? 'image' : 'text';
        if (this._doubleClick.register(event.get_time(),x,y,mode)) {
            // Double-click actions must never accidentally begin a pan.
            this._boardPan=null;
            if (mode==='image')
                this._chooseImage({x,y});
            else
                this._createNoteAtScreen(x,y);
            return Clutter.EVENT_STOP;
        }
        // The first click becomes a PENDING drag, with no camera movement.
        // This preserves plain double-click and Ctrl+double-click.
        // Only a held left button moving at least 6px activates navigation.
        this._boardPan={start:{x,y},last:{x,y},active:false,changed:false};
        return Clutter.EVENT_PROPAGATE;
    }

    // Advance a camera-pan session after its movement threshold is crossed.
    _moveBoardPan(event,x,y) {
        const session=this._boardPan;
        if (!session)
            return Clutter.EVENT_PROPAGATE;
        if (!(event.get_state() & Clutter.ModifierType.BUTTON1_MASK)) {
            this._endBoardPan();
            return Clutter.EVENT_PROPAGATE;
        }
        if (!session.active) {
            if (!boardDragHasStarted(session.start,{x,y}))
                return Clutter.EVENT_PROPAGATE;
            session.active=true;
            this._doubleClick.reset();
        }
        const dx=x-session.last.x;
        const dy=y-session.last.y;
        session.last={x,y};
        const next=dragBoardView(this._view,dx,dy,
            {width:global.stage.width,height:global.stage.height},
            this._boardSize);
        if (next.panX!==this._view.panX || next.panY!==this._view.panY) {
            session.changed=true;
            this._view=next;
            this._applyView();
            this._scheduleView();
        }
        return Clutter.EVENT_STOP;
    }

    // Finish camera panning and persist the final camera immediately.
    _endBoardPan() {
        const session=this._boardPan;
        this._boardPan=null;
        if (!session)
            return false;
        if (session.active && session.changed && this._service) {
            // Commit the latest camera once at release. A timeout saved
            // during dragging is harmless: D-Bus calls are serialized.
            if (this._viewTimer) {
                GLib.Source.remove(this._viewTimer);
                this._viewTimer=0;
            }
            this._persistView();
        }
        return session.active;
    }

    // Acquire a stage grab for resize/rotate gestures that must not escape.
    _beginGrab() {
        if (this._grab)
            return false;
        try {
            this._grab = global.stage.grab(this._root);
            return !!this._grab;
        } catch (error) {
            console.warn('Evidence Note Board: pointer grab unavailable', error.message);
            this._grab = null;
            return false;
        }
    }

    // Initialize note-drag state from a stage coordinate.
    _beginNoteDrag(note,x,y) {
        if (!this._service || !this._alive || this._dragPoint)
            return false;
        this._cancelTextHold();
        this._doubleClick.reset();
        this._dragPoint={x,y};
        this._dragNote=note;
        return true;
    }

    // Start a primary-button note drag without taking a stage grab.
    _startNoteDrag(event, note) {
        // Stage capture sees motion/release even when Clutter.Text or a
        // sibling actor would swallow the bubbling event. Do not grab.
        if (event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [x,y]=event.get_coords();
        return this._beginNoteDrag(note,x,y)
            ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }

    // Cancel the timer that distinguishes text selection from paper dragging.
    _cancelTextHold() {
        const pending=this._textHold;
        if (!pending)
            return;
        this._textHold=null;
        if (pending.timer)
            GLib.Source.remove(pending.timer);
    }

    // Turn a stationary long press in text into a paper drag.
    _startTextHold(event,note) {
        if (event.get_button()!==1 || !this._service || this._dragPoint ||
            (event.get_state() & (Clutter.ModifierType.CONTROL_MASK |
                Clutter.ModifierType.SHIFT_MASK)))
            return;
        this._cancelTextHold();
        const [x,y]=event.get_coords();
        const candidate={note,x,y,timer:0};
        this._textHold=candidate;
        candidate.timer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,TEXT_HOLD_MS,()=>{
            candidate.timer=0;
            if (this._textHold===candidate) {
                this._textHold=null;
                this._beginNoteDrag(note,candidate.x,candidate.y);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // Hit-test paper borders and begin drag, resize or rotation.
    _startPaperGesture(event, note, paper) {
        if (event.get_button() !== 1 || !this._service)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        // The local point respects canvas zoom/pan and actor rotation.
        const [ok, lx, ly] = paper.transform_stage_point(x, y);
        if (!ok)
            return Clutter.EVENT_PROPAGATE;
        const kind = gestureAt(lx, ly, note.width, note.height, note.type, this._view.zoom);
        if (kind !== 'edit')
            this._cancelTextHold();
        if (kind === 'edit')
            return Clutter.EVENT_PROPAGATE;
        if (kind === 'drag')
            return this._startNoteDrag(event,note); // Hold to drag, no pan.
        if (!this._beginGrab())
            return Clutter.EVENT_PROPAGATE;
        this._dragPoint = {x, y};
        this._resizeSession = {
            kind, note, startX: x, startWidth: note.width,
            startHeight: note.height, startRotation: note.rotation,
            startAngle: pointerAngle(x, y, note, this._view),
        };
        return Clutter.EVENT_STOP;
    }

    // Bind paper-level gestures while preserving native text editing.
    _connectPaperGestures(paper, note) {
        paper.connect('button-press-event', (_actor, event) => {
            if (event.get_button()===3 && note.type==='text') {
                const item=this._notes.get(note.id);
                if (item)
                    this._openNoteMenu(item,event,false);
                return Clutter.EVENT_STOP;
            }
            const result = this._startPaperGesture(event, note, paper);
            if (result === Clutter.EVENT_STOP)
                return result;
            // Empty Clutter.Text can lose its pointer target on GNOME
            // Wayland, so any editable paper click can refocus it.
            if (event.get_button()===1 && note.type==='text') {
                const body=this._notes.get(note.id)?.body;
                if (body && (event.get_source()===paper ||
                    body.get_text()==='')) {
                    global.stage.set_key_focus(body);
                    this._syncCaretFocus();
                    // Do not disturb selection/caret when a nonempty
                    // Clutter.Text itself received the click.
                    if (event.get_source()!==body)
                        body.set_cursor_position(-1);
                }
            }
            // Child Clutter.Text handles its own cursor. Do not let
            // note clicks reach the blank-board double-click recognizer.
            return event.get_button() === 1
                ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
    }

    // Fallback for empty papers missed by GNOME's actor picking:
    // the stage click can land on the background although the note is
    // drawn. Only the EDIT interior can refocus the empty text buffer.
    _focusEmptyTextAt(stageX,stageY) {
        for (const item of [...this._notes.values()].reverse()) {
            const {note,actor,body}=item;
            if (note.type!=='text' || !body || body.get_text()!=='')
                continue;
            const [ok,x,y]=actor.transform_stage_point(stageX,stageY);
            if (!ok || !isEmptyTextEditorHit(note,body.get_text(),x,y,
                this._view.zoom))
                continue;
            global.stage.set_key_focus(body);
            this._syncCaretFocus();
            body.set_cursor_position(-1);
            return note;
        }
        return null;
    }

    // Exactly one caret may blink, and only while its Clutter.Text owns
    // the GNOME Stage key focus. Remove the timer on blur or extension
    // teardown so a stale callback never touches destroyed Shell actors.
    _stopCaretBlink() {
        if (this._caretBlinkTimer) {
            GLib.Source.remove(this._caretBlinkTimer);
            this._caretBlinkTimer = 0;
        }
        if (this._focusedBody)
            this._focusedBody.set_cursor_visible(false);
        this._focusedBody = null;
    }

    _syncCaretFocus() {
        if (!this._alive)
            return;
        const focus=global.stage.get_key_focus();
        const body=focus && this._bodyNotes.has(focus) ? focus : null;
        if (body===this._focusedBody)
            return;
        this._stopCaretBlink();
        if (!body)
            return;
        this._focusedBody=body;
        body.set_cursor_visible(true);
        this._caretBlinkTimer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            CARET_BLINK_MS,()=>{
                if (!this._alive || global.stage.get_key_focus()!==body ||
                    !this._bodyNotes.has(body)) {
                    this._caretBlinkTimer=0;
                    this._stopCaretBlink();
                    return GLib.SOURCE_REMOVE;
                }
                body.set_cursor_visible(!body.get_cursor_visible());
                return GLib.SOURCE_CONTINUE;
            });
    }

    _isEditorPress(stageX,stageY,source) {
        // Settings is an overlay above world notes: clicking it should
        // always blur the editor even if a note is behind the popup.
        if (source && (
            source===this._settingsButton ||
            this._settingsButton?.contains(source) ||
            (this._settingsMenu && this._settingsMenu.contains(source))))
            return false;
        // Context-menu actions need the selection/cursor that opened them.
        if (source && this._noteMenu?.contains(source))
            return true;
        if (source && this._bodyNotes.has(source))
            return true;
        // Wayland sometimes picks the PAPER rather than a zero-glyph
        // Clutter.Text. Use the same rotated/zoomed local-space hit box
        // as PR #30, now for nonempty text as well; ignore pin/borders.
        for (const item of [...this._notes.values()].reverse()) {
            const {note,actor,body}=item;
            if (note.type!=='text' || !body)
                continue;
            const [ok,x,y]=actor.transform_stage_point(stageX,stageY);
            if (ok && isTextEditorHit(note,x,y,this._view.zoom))
                return true;
        }
        return false;
    }

    _blurEditorOnOutsidePress(event) {
        const current=global.stage.get_key_focus();
        if (!current || !this._bodyNotes.has(current))
            return;
        const [x,y]=event.get_coords();
        if (this._isEditorPress(x,y,event.get_source()))
            return;
        // Clearing key focus is separate from pointer propagation. Board
        // navigation, photo import, Settings and note drag still receive
        // the original click, but the old note loses its visible caret.
        global.stage.set_key_focus(null);
        this._syncCaretFocus();
    }

    // Observe stage events that child actors may consume before bubbling.
    _capturedPointer(event) {
        if (!this._alive)
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type===Clutter.EventType.BUTTON_PRESS && event.get_button()===1)
            this._blurEditorOnOutsidePress(event);
        // Capture text presses before Clutter.Text/its click gesture can
        // consume them on GNOME 50. Keep the body handler as a fallback.
        if (type === Clutter.EventType.BUTTON_PRESS &&
            event.get_button()===1 && !this._dragPoint) {
            const source=event.get_source();
            let note=this._bodyNotes.get(source);
            if (!note && (source===this._root || source===this._world)) {
                // An empty paper may not be picked by the compositor.
                // Recover focus without consuming the pointer event.
                const [x,y]=event.get_coords();
                note=this._focusEmptyTextAt(x,y);
            }
            if (note)
                this._startTextHold(event,note);
        }
        if (type === Clutter.EventType.KEY_PRESS && this._stringDraft &&
            event.get_key_symbol() === Clutter.KEY_Escape) {
            this._cancelString();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.MOTION) {
            const [x, y] = event.get_coords();
            if (this._textHold) {
                const candidate=this._textHold;
                // Quick movement keeps native text selection behavior.
                if (!keepTextHold(candidate,{x,y},
                    Boolean(event.get_state() & Clutter.ModifierType.BUTTON1_MASK)))
                    this._cancelTextHold();
            }
            if (this._dragPoint) {
                // Recover if release occurred outside the desktop actor.
                const button=Clutter.ModifierType.BUTTON1_MASK;
                if (!(event.get_state() & button)) {
                    const changed = this._releaseAsAborted();
                    return changed ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
                }
                return this._motion(event);
            }
            // Board panning is allowed only when the press began in a
            // blank region; pin, image, editor and resize gestures never
            // register _boardPan.
            if (this._boardPan) {
                const result=this._moveBoardPan(event,x,y);
                if (result===Clutter.EVENT_STOP)
                    return result;
            }
            if (this._stringDraft) {
                this._stringDraft.target = {
                    x: (x - this._view.panX) / this._view.zoom,
                    y: (y - this._view.panY) / this._view.zoom,
                };
                this._queueStrings();
            }
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            if (event.get_button()===1)
                this._cancelTextHold();
            if (this._dragPoint) {
                const result = this._release(event);
                if (result === Clutter.EVENT_STOP)
                    return result;
            }
            if (this._boardPan && event.get_button()===1) {
                const wasPanning=this._endBoardPan();
                if (wasPanning)
                    return Clutter.EVENT_STOP;
            }
            if (this._stringDraft && event.get_button() === 1) {
                const [x, y] = event.get_coords();
                const targetId = nearestTargetPin(
                    [...this._notes.values()].map(item => item.note),
                    this._view, {x, y}, this._stringDraft.sourceId);
                if (targetId) {
                    this._completeString(targetId);
                    return Clutter.EVENT_STOP;
                }
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // Recover and persist when a button release is lost outside the actor.
    _releaseAsAborted() {
        if (!this._dragPoint)
            return false;
        // Persist at the last valid position instead of leaving grab active.
        const note = this._dragNote;
        const resize = this._resizeSession?.note;
        this._endDrag();
        if (note)
            this._service?.moveNote(note.id, note.x, note.y)
                .catch(() => this._saveError());
        else if (resize)
            this._persistGeometry(resize).catch(() => this._saveError());
        return true;
    }

    // Apply the current drag/resize/rotate motion to its note model.
    _motion(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (this._resizeSession) {
            const session = this._resizeSession;
            const {note, kind, startX, startWidth, startHeight} = session;
            if (kind === 'rotate') {
                const nextAngle = pointerAngle(x, y, note, this._view);
                note.rotation = normalizeAngle(session.startRotation +
                    angleDelta(session.startAngle, nextAngle));
            } else if (note.type === 'image') {
                const size = resizedImage(startWidth, startHeight,
                    x - startX, this._view.zoom);
                note.width = size.width;
                note.height = size.height;
            } else {
                note.width = resizedTextWidth(startWidth,
                    x - startX, this._view.zoom);
            }
            this._applyGeometry(note);
            if (note.type === 'text' && kind !== 'rotate')
                this._syncTextHeight(note);
            return Clutter.EVENT_STOP;
        }
        const dx = x - this._dragPoint.x;
        const dy = y - this._dragPoint.y;
        if (this._dragNote) {
            this._dragNote.x+=dx/this._view.zoom;
            this._dragNote.y+=dy/this._view.zoom;
            this._applyPosition(this._dragNote);
        }
        this._dragPoint = {x, y};
        return Clutter.EVENT_STOP;
    }

    // Commit a completed note transform on primary-button release.
    _release(event) {
        if (!this._dragPoint)
            return Clutter.EVENT_PROPAGATE;
        if (this._resizeSession && event.get_button() === 1) {
            const {note} = this._resizeSession;
            this._endDrag();
            this._persistGeometry(note)
                .catch(() => this._saveError());
            return Clutter.EVENT_STOP;
        }
        if (this._dragNote && event.get_button() === 1) {
            const note = this._dragNote;
            this._endDrag();
            this._service?.moveNote(note.id, note.x, note.y).catch(() => this._saveError());
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // Clear transform state and dismiss any active stage grab.
    _endDrag() {
        this._cancelTextHold();
        this._resizeSession = null;
        this._dragPoint = null;
        this._dragNote = null;
        this._grab?.dismiss();
        this._grab = null;
    }

    // Build an editable text-paper actor and wire autosave behavior.
    _renderNote(note, focus = false) {
        if (note.type === 'image')
            return this._renderImageNote(note);
        if (!this._alive || this._notes.has(note.id))
            return;
        this._confineGeometry(note,true);

        const paper = new St.Widget({
            reactive: true,
            layout_manager:new Clutter.FixedLayout(),
            style_class: 'evidence-paper evidence-paper-aged',
        });
        paper.set_size(note.width, note.height);
        paper.set_position(note.x, note.y);

        // The paper is entirely an editor; pin and context menu live
        // above it in separate world actors.

        // One editable multiline field directly on the paper: no St.Entry,
        // CSS textbox, title row or visually separate editor background.
        // Previously saved titles are shown as body text until migrated.
        const ink = new Cogl.Color();
        ink.init_from_4f(81 / 255, 72 / 255, 55 / 255, 1.0);
        const rich=richTextForNote(note);
        const body = new Clutter.Text({
            text: rich.text,
            reactive: true,
            editable: true,
            selectable: true,
            cursor_visible: false, // Only visible while this note has focus.
            single_line_mode: false,
            activatable: false,
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            color: ink,
        });
        // Fixed coordinates leave exactly the configured paper padding and
        // allow inline badge actors to sit above the editable text.
        body.set_position(TEXT_HORIZONTAL_PADDING,TEXT_VERTICAL_PADDING);
        body.set_size(
            Math.max(120,note.width-TEXT_HORIZONTAL_PADDING*2),
            Math.max(1,note.height-TEXT_VERTICAL_CHROME)
        );
        body.connect('button-press-event', (_actor,event) => {
            global.stage.set_key_focus(body);
            this._syncCaretFocus();
            if (event.get_button()===3) {
                // Preserve the blinking cursor/selection exactly as-is. Menu
                // actions capture this position before their buttons take focus.
                this._openNoteMenu(item,event,true);
                return Clutter.EVENT_STOP;
            }
            // A quick drag highlights words (Ctrl+B stays intact).
            // Hold the text for ~330ms before moving to drag the paper.
            this._startTextHold(event,note);
            return Clutter.EVENT_PROPAGATE;
        });
        paper.add_child(body);
        // Border gestures do not interfere with the multiline editor.
        this._connectPaperGestures(paper, note);

        const item={note,actor:paper,body,
            boldSpans:rich.bold,redSpans:rich.red,badges:rich.badges,
            badgeActors:[],lastText:rich.text,
            persistedGeometry:{width:note.width,height:note.height,
                rotation:note.rotation}};
        this._bodyNotes.set(body,note);
        body.connect('key-press-event',(_actor,event)=>{
            const key=event.get_key_symbol();
            if ((event.get_state() & Clutter.ModifierType.CONTROL_MASK) &&
                (key===Clutter.KEY_b || key===Clutter.KEY_B)) {
                this._toggleBoldOnSelection(item);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        body.connect('notify::text', () => {
            const latest=body.get_text();
            item.boldSpans=rebaseBoldSpans(item.lastText,latest,item.boldSpans);
            item.redSpans=rebaseBoldSpans(item.lastText,latest,item.redSpans);
            item.badges=rebaseBadges(item.lastText,latest,item.badges);
            item.lastText=latest;
            this._applyBoldAttributes(item);
            this._syncTextHeight(note);
            this._scheduleNote(note.id);
        });
        this._notes.set(note.id, item);
        this._applyPaperColor(item);
        this._world.add_child(paper);
        this._installPin(note);
        this._applyGeometry(note);
        // Measure after allocation; Pango may not know the final width
        // immediately when an actor is first placed on the board.
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._alive && this._notes.has(note.id))
                this._syncTextHeight(note);
            return GLib.SOURCE_REMOVE;
        });

        if (focus) {
            global.stage.set_key_focus(body);
            this._syncCaretFocus();
            body.set_cursor_position(-1);
        }

        // Compat with the previously deployed two-column SQLite model.
        // Never discard a user's old title. Debounce saves it to content,
        // clears title and keeps the same note ID without a DB migration.
        if (hasLegacyTitle(note))
            this._scheduleNote(note.id);
    }

    // Debounce rich-text persistence for one dirty note.
    _scheduleNote(id) {
        if (!this._alive)
            return;
        this._dirtyNotes.add(id);
        if (!this._service)
            return;
        this._cancelNoteTimer(id);
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._timers.delete(id);
            this._flushNote(id);
            return GLib.SOURCE_REMOVE;
        });
        this._timers.set(id, source);
    }

    // Persist the latest rich text and geometry snapshot for one note.
    _flushNote(id) {
        this._cancelNoteTimer(id);
        const item = this._notes.get(id);
        if (!item || !this._service)
            return;
        if (!item.body) // Image notes contain no editable text.
            return;
        const content=encodeRichText(item.body.get_text(),item.boldSpans,
            item.redSpans,item.badges);
        // Persist geometry only if wrapping actually changed the paper size.
        this._persistGeometry(item.note)
            .catch(() => this._saveError());
        // Leave the existing DB schema and D-Bus signature intact while
        // using an empty legacy title for body-only notes.
        this._service.updateNote(id, '', content).then(()=>{
            if (this._alive && item.body &&
                encodeRichText(item.body.get_text(),item.boldSpans,
                    item.redSpans,item.badges)===content)
                this._dirtyNotes.delete(id);
        }).catch(()=>{
            this._dirtyNotes.add(id);
            this._saveError();
        });
    }

    // Remove one note's pending autosave source.
    _cancelNoteTimer(id) {
        const source = this._timers.get(id);
        if (source)
            GLib.Source.remove(source);
        this._timers.delete(id);
    }

    // Release every actor, source, signal, watcher and transient gesture.
    destroy() {
        // Remove the caret source BEFORE removing text actors or Stage
        // signals; no source callback can outlive the extension.
        this._stopCaretBlink();
        this._endBoardPan();
        this._cancelTextHold();
        this._cancelString();
        this._closeNoteMenu();
        this._closePinMenu();
        this._deletingNotes.clear();
        this._connections.clear();
        if (this._paintTimer)
            GLib.Source.remove(this._paintTimer);
        this._paintTimer=0;
        if (this._resizeTimer)
            GLib.Source.remove(this._resizeTimer);
        this._resizeTimer=0;
        if (this._reconnectTimer)
            GLib.Source.remove(this._reconnectTimer);
        this._reconnectTimer=0;
        this._closeSettingsMenu();
        if (this._loadSource) {
            GLib.Source.remove(this._loadSource);
            this._loadSource = 0;
        }
        this._stringsLayer = null;
        this._alive = false;
        this._connectionRevision++;
        if (this._backendWatchId) {
            Gio.bus_unwatch_name(this._backendWatchId);
            this._backendWatchId = 0;
        }
        this._imagePicker?.force_exit();
        this._imagePicker = null;
        this._doubleClick.reset();
        this._endDrag();
        for (const id of [...this._timers.keys()])
            this._flushNote(id);
        if (this._viewTimer) {
            GLib.Source.remove(this._viewTimer);
            this._viewTimer = 0;
            this._persistView();
        }
        if (this._backgroundSignal && this._backgroundGroup) {
            this._backgroundGroup.disconnect(this._backgroundSignal);
            this._backgroundSignal = 0;
        }
        for (const id of this._stageSignals)
            global.stage.disconnect(id);
        this._stageSignals = [];
        for (const item of this._notes.values())
            item.pin?.destroy();
        this._notes.clear();
        this._root?.destroy();
        this._root = null;
        this._world = null;
        this._hud = null;
        this._settingsButton = null;
        this._service = null;
        this._backgroundGroup = null;
    }
}
