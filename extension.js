/**
	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 2 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as DBusIface from './dbus.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';
import * as History from 'resource:///org/gnome/shell/misc/history.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SCROLLBACK_IMMEDIATE_TIME = 3 * 60;
const SCROLLBACK_RECENT_TIME = 15 * 60;
const SCROLLBACK_RECENT_LENGTH = 20;
const SCROLLBACK_IDLE_LENGTH = 5;

const SCROLLBACK_HISTORY_LINES = 10;

const COMPOSING_STOP_TIMEOUT = 5;

const CHAT_EXPAND_LINES = 12;

const NotificationDirection = {SENT: 'chat-sent', RECEIVED: 'chat-received'};
const MessageType = {NORMAL: 0, ACTION: 1};
const ChannelChatState = {ACTIVE: 2, PAUSED: 3, COMPOSING: 4};

function makeMessage(text, sender, timestamp, direction) {
	text = _fixText(text);

	let type = MessageType.NORMAL;
	if (text.substr(0, 4) == '/me ' && direction != NotificationDirection.SENT) {
		text = text.substr(4);
		type = MessageType.ACTION;
	}

	return {
		text: text,
		messageType: type,
		sender: sender,
		timestamp: timestamp,
		direction: direction
	};
}

function _fixText(text) {
	// remove all tags
	let _text = text.toString();
	_text = _text.replace(/<br>/gi, "\n");
	_text = _text.replace(/<\/?[^>]+(>|$)/g, "");
	_text = _text.replace(/&lt;/g, "<");
	_text = _text.replace(/&gt;/g, ">");
	_text = _text.replace(/&apos;/g, "'");
	_text = _text.replace(/&quot;/g, "\"");
	_text = _text.replace(/&amp;/g, "&");
	return _text;
}

const USER_OFFLINE = 0;
const USER_IDLE = 1;
const USER_AWAY = 2;
const USER_INVISIBLE = 3;
const USER_BUSY = 4;
const USER_ONLINE = 5;

function getStatusCode(s) {
	switch (s.toString()) {
		case "available":
		case "freeforchat":
		case "free4chat":
		case "custom":
		case "mobile":
		case "tune":
		case "mood":
		case "online":
			return USER_ONLINE;
		case "dnd":
		case "na":
		case "occupien":
		case "unavailable":
			return USER_BUSY;
		case "invisible":
			return USER_INVISIBLE;
		case "away":
			return USER_AWAY;
		case "extended_away":
			return USER_IDLE;
		default:
			return USER_OFFLINE;
	}
}

function getStatusIcon(s) {
	let iconName;
	switch (s) {
		case USER_ONLINE:
			iconName = 'user-available';
			break;
		case USER_BUSY:
			iconName = 'user-busy';
			break;
		case USER_INVISIBLE:
			iconName = 'user-invisible';
			break;
		case USER_AWAY:
			iconName = 'user-away';
			break;
		case USER_IDLE:
			iconName = 'user-idle';
			break;
		default:
			iconName = 'user-offline';
	}
	return new Gio.ThemedIcon({name: iconName});
}

const ChatNotificationMessage = GObject.registerClass(
class ChatNotificationMessage extends GObject.Object {
	_init(props = {}) {
		super._init();
		this.set(props);
	}
});

const ChatNotification = GObject.registerClass({
	Signals: {
		'message-removed': {param_types: [ChatNotificationMessage.$gtype]},
		'message-added': {param_types: [ChatNotificationMessage.$gtype]},
		'timestamp-changed': {param_types: [ChatNotificationMessage.$gtype]},
	}
}, class ChatNotification extends MessageTray.Notification {
	_init(source) {
		super._init(source, source.title, null, {secondaryGIcon: source.getSecondaryIcon()});
		this.setUrgency(MessageTray.Urgency.HIGH);
		this.setResident(true);

		this.messages = [];
		this._timestampTimeoutId = 0;
	}

	destroy(reason) {
		if (this._timestampTimeoutId) {
			GLib.source_remove(this._timestampTimeoutId);
		}
		this._timestampTimeoutId = 0;
		super.destroy(reason);
	}

	appendMessage(message, noTimestamp) {
		let body = GLib.markup_escape_text(message.text, -1);
		let styles = [message.direction];

		if (message.messageType === MessageType.ACTION) {
			let sender = GLib.markup_escape_text(message.sender, -1);
			body = `<i>${sender}</i> ${body}`;
			styles.push('chat-action');
		}

		if (message.direction === NotificationDirection.RECEIVED) {
			this.update(this.source.title, body, {
				datetime: GLib.DateTime.new_from_unix_local(message.timestamp),
				bannerMarkup: true,
			});
		}

		let group = message.direction === NotificationDirection.RECEIVED ? 'received' : 'sent';
		this._append({
			body,
			group,
			styles,
			timestamp: message.timestamp,
			noTimestamp
		});
	}

	_filterMessages() {
		if (this.messages.length < 1) return;

		let lastMessageTime = this.messages[0].timestamp;
		let currentTime = Date.now() / 1000;
		let maxLength = lastMessageTime < currentTime - SCROLLBACK_RECENT_TIME
			? SCROLLBACK_IDLE_LENGTH : SCROLLBACK_RECENT_LENGTH;
		let filteredHistory = this.messages.filter(item => item.realMessage);
		if (filteredHistory.length > maxLength) {
			let toKeep = filteredHistory[maxLength];
			let expired = this.messages.splice(this.messages.indexOf(toKeep));
			for (let i = 0; i < expired.length; i++) {
				this.emit('message-removed', expired[i]);
			}
		}
	}

	_append(props) {
		let currentTime = Date.now() / 1000;
		props = Params.parse(props, {
			body: null,
			group: null,
			styles: [],
			timestamp: currentTime,
			noTimestamp: false
		});
		const {noTimestamp} = props;
		delete props.noTimestamp;

		if (this._timestampTimeoutId) GLib.source_remove(this._timestampTimeoutId);
		this._timestampTimeoutId = 0;

		let message = new ChatNotificationMessage({
			relaMessage: props.group !== 'meta',
			showTimestamp: false,
			...props,
		});

		this.messages.unshift(message);
		this.emit('message-added', message);

		if (!noTimestamp) {
			let timestamp = props.timestamp;
			if (timestamp < currentTime - SCROLLBACK_IMMEDIATE_TIME) {
				this.appendTimestamp();
			} else {
				this._timestampTimeoutId = GLib.timeout_add_seconds(
					GLib.PRIORITY_DEFAULT,
					SCROLLBACK_IMMEDIATE_TIME - (currentTime - timestamp),
					this.appendTimestamp.bind(this)
				);
				GLib.Source.set_name_by_id(this._timestampTimeoutId, '[gnome-shell] this.appendTimestamp');
			}
		}

		this._filterMessages();
	}

	appendTimestamp() {
		this._timestampTimeoutId = 0;
		this.messages[0].showTimestamp = true;
		this.emit('timestamp-changed', this.messages[0]);
		this._filterMessages();
		return GLib.SOURCE_REMOVE;
	}
});

const ChatLineBox = GObject.registerClass(
class ChatLineBox extends St.BoxLayout {
	vfunc_get_preferred_height(forWidth) {
		let [, natHeight] = super.vfunc_get_preferred_height(forWidth);
		return [natHeight, natHeight];
	}
});

const ChatNotificationBanner = GObject.registerClass(
class ChatNotificationBanner extends MessageTray.NotificationBanner {
	_init(notification) {
		super._init(notification);
		this._responseEntry = new St.Entry({
			style_class: 'chat-response',
			x_expand: true,
			can_focus: true
		});
		let clutter_text = this._responseEntry.clutter_text;
		clutter_text.connect('activate', this._onEntryActivated.bind(this));
		clutter_text.connect('text-changed', this._onEntryChanged.bind(this));
		this.setActionArea(this._responseEntry);
		clutter_text.connect('key-focus-in', () => { this.focused = true; });
		clutter_text.connect('key-focus-out', () => {
			this.focused = false;
			this.emit('unfocused');
		});

		this._scrollArea = new St.ScrollView({
			style_class: 'chat-scrollview vfade',
			vscrollbar_policy: St.PolicyType.AUTOMATIC,
			hscrollbar_policy: St.PolicyType.NEVER,
			visible: this.expanded
		});
		this._contentArea = new St.BoxLayout({
			style_class: 'chat-body',
			vertical: true
		});
		this._scrollArea.add_actor(this._contentArea);

		this.setExpandedBody(this._scrollArea);
		this.setExpandedLines(CHAT_EXPAND_LINES);

		this._lastGroup = null;

		this._oldMaxScrollValue = this._scrollArea.vscroll.adjustment.value;
		this._scrollArea.vscroll.adjustment.connect('changed', adjustment => {
			if (adjustment.value === this._oldMaxScrollValue) {
				this.scrollTo(St.Side.BOTTOM);
			}
			this._oldMaxScrollValue = Math.max(
				adjustment.lower, adjustment.upper - adjustment.page_size
			);
		});

		this._inputHistory = new History.HistoryManager({entry: clutter_text});
		this._composingTimeoutId = 0;
		this._messageActors = new Map();

		this.notification.connectObject(
			'timestamp-changed', (n, message) => this._updateTimestamp(message),
			'message-added', (n, message) => this._addMessage(message),
			'message-removed', (n, message) => {
				let actor = this._messageActors.get(message);
				if (this._messageActors.delete(message)) {
					actor.destroy();
				}
			},
			this
		);

		for (let i = this.notification.messages.length - 1; i >= 0; i--) {
			this._addMessage(this.notification.messages[i]);
		}
	}

	destroy() {
		if (this._composingTimeoutId) {
			GLib.source_remove(this._composingTimeoutId);
			this._composingStopTimeout();
		}
		super.destroy();
	},

	scrollTo(side) {
		let adjustment = this._scrollArea.vscroll.adjustment;
		if (side === St.Side.TOP) {
			adjustment.value = adjustment.lower;
		} else if (side === St.Side.BOTTOM) {
			adjustment.value = adjustment.upper;
		}
	}

	hide() {
		this.emit('done-displaying');
	}

	_addMessage(message) {
		let body = new MessageList.URLHighlighter(message.body, true, true);
		let styles = message.styles;
		for (let i = 0; i < styles.length; i++) {
			body.add_style_class_name(styles[i]);
		}

		let group = message.group;
		if (group !== this._lastGroup) {
			this._lastGroup = group;
			body.add_style_class_name('chat-new-group');
		}

		let lineBox = new ChatLineBox();
		lineBox.add(body);
		this._contentArea.add_actor(lineBox);
		this._messageActors.set(message, lineBox);

		this._updateTimestamp(message);
	}

	_updateTimestamp(message) {
		let actor = this._messageActors.get(message);
		if (!actor) return;

		while (actor.get_n_children() > 1) {
			actor.get_child_at_index(1).destroy();
		}
		if (message.showTimestamp) {
			let messageTime = message.timestamp;
			let messageDate = new Date(messageTime * 1000);
			let timeLabel = Util.createTimeLabel(messageDate);
			timeLabel.style_class = 'chat-meta-message';
			timeLabel.x_expand = true;
			timeLabel.y_expand = true;
			timeLabel.x_align = Clutter.ActorAlign.END;
			timeLabel.y_align = Clutter.ActorAlign.END;
			actor.add_actor(timeLabel);
		}
	}

	_onEntryActivated() {
		let text = this._responseEntry.get_text();
		if (text === '') return;

		this._inputHistory.addItem(text);

		this._responseEntry.set_text('');
		this.notification.source.respond(text);
	}

	_composingStopTimeout() {
		this._composingTimeoutId = 0;
		this.notification.source.setChatState(ChannelChatState.PAUSED);
		return GLib.SOURCE_REMOVE;
	}

	_onEntryChanged() {
		let text = this._responseEntry.get_text();

		if (this._composingTimeoutId > 0) {
			GLib.source_remove(this._composingTimeoutId);
			this._composingTimeoutId = 0;
		}

		if (text === '') {
			this.notification.source.setChatState(ChannelChatState.ACTIVE);
		} else {
			this.notification.source.setChatState(ChannelChatState.COMPOSING);
			this._composingTimeoutId = GLib.timeout_add_seconds(
				GLib.PRIORITY_DEFAULT,
				COMPOSING_STOP_TIMEOUT,
				this._composingStopTimeout.bind(this)
			);
			GLib.Source.set_name_by_id(
				this._composingTimeoutId, '[gnome-shell] this._composingStopTimeout'
			);
		}
	}
});

const Source = GObject.registerClass(
class Source extends MessageTray.Source {
	_init(client, account, author, conversation) {
		let proxy = client.proxy;
		super._init(_fixText(proxy.PurpleConversationGetTitleSync(conversation).toString()));
		this._status_id = 0;
		this._account = account;
		this._chatState = 0;
		this._client = client;
		this._author = author;
		this._conversation = conversation;
		this._conv_name = proxy.PurpleConversationGetNameSync(this._conversation).toString();
		this._conv_gc = proxy.PurpleConversationGetGcSync(this._conversation);

		this.isChat = true;
		this._pendingMessages = [];

		this._notification = new ChatNotification(this);
		this._notification.connect('activated', this.open.bind(this));
		this._notification.connect('updated', () => {
			if (this._banner && this._banner.expanded) this._markAllSeen();
		});

		Main.messageTray.add(this);
		this.pushNotification(this._notification);
	}

	_markAllSeen() {
		this._pendingMessages = [];
		this.countUpdated();
	}

	_notificationExpanded() {
		this._markAllSeen();
	}

	_createPolicy() {
		return new MessageTray.NotificationApplicationPolicy('pidgin');
	}

	createBanner() {
		this._banner = new ChatNotificationBanner(this._notification);

		// We ack messages when the user expands the new notification
		let id = this._banner.connect('expanded', this._markAllSeen.bind(this));
		this._banner.connect('destroy', () => {
			this._banner.disconnect(id);
			this._banner = null;
		});

		return this._banner;
	}

	handleMessage(author, text, flag, timestamp) {
		let direction = null;
		if (flag & 1) {
			direction = NotificationDirection.SENT;
		} else if (flag & 2) {
			direction = NotificationDirection.RECEIVED;
		} else {
			return;
		}

		let _now = Date.now() / 1000;
		let _ts = timestamp == null ? _now : timestamp;
		let message = this._makeMessage(author, text, _ts, direction);
		this._notification.appendMessage(message, false);

		if (direction == NotificationDirection.RECEIVED) {
			let focus = this._client.proxy.PurpleConversationHasFocusSync(this._conversation);
			if ((!focus || focus == 0) && (_ts >= this._client.disable_timestamp && (this._client.disable_timestamp > 0 || timestamp == null))) {
				this._pendingMessages.push(message);
				this.countUpdated();
				if (!this._isChat || flag == 34) {
					this.showNotification();
				}
			}
		} else {
			this._markAllSeen();
		}
	}

	setChatState(state) {
		if (this._chatState == state || this._client.proxy.PurplePrefsGetBoolSync('/purple/conversations/im/send_typing') != 1) {
			return;
		}
		this._chatState = state;
		let s = 0;
		switch (state) {
			case ChannelChatState.COMPOSING:
				s = 1;
				break;
			case ChannelChatState.PAUSED:
				s = 2;
				break;
		}
		this._client.proxy.ServSendTypingRemote(this._conv_gc, this._conv_name, s);
	}

	destroy() {
		if (this._banner) {
			this._banner.destroy();
		}
		super.destroy();
	}

	getIcon() {
		let file = this._icon_file;
		if (file) {
			return new Gio.FileIcon({ file: Gio.File.new_for_uri(file) });
		} else {
			return new Gio.ThemedIcon({ name: 'avatar-default' });
		}
	}

	getSecondaryIcon() {
		return getStatusIcon(this._status_id);
	}

	_openPurpleConversation() {
		this._client.proxy.PurpleConversationPresentRemote(this._conversation);
	}

	open(notification) {
		Main.overview.hide();
		Main.panel.closeCalendar();
		if (this._client._settings.get_boolean('reopen-banner') && !(this._banner && this._banner.expanded)) {
			this.showNotification();
		} else {
			this._openPurpleConversation();
		}
	}

	respond(text) {
		let proxy = this._client.proxy;
		// looks like pidgin has special behavior with &apos; #40
		let message = GLib.markup_escape_text(text, -1).replace(/&apos;/g, "'");
		if(this._isChat)
			proxy.PurpleConvChatSendRemote(this._conv_id, message);
		else
			proxy.PurpleConvImSendRemote(this._conv_id, message);
	}

	showNotification() {
		super.showNotification(this._notification);
	}

	get count() {
		return this._pendingMessages.length;
	}

	get unseenCount() {
		return this.count;
	}

	get countVisible() {
		return this.count > 0;
	}
});

const ImSource = GObject.registerClass(
class ImSource extends Source {
	_init(client, account, author, conversation) {
		super._init(client, account, author, conversation);
		this._isChat = false;
		let proxy = client.proxy;
		this._conv_id = proxy.PurpleConvImSync(conversation);
		this._buddy = proxy.PurpleFindBuddySync(account, author);
		this._buddy_alias = _fixText(proxy.PurpleBuddyGetAliasSync(this._buddy));
		this._buddy_contact = proxy.PurpleBuddyGetContactSync(this._buddy);
		this._buddy_presence = proxy.PurpleBuddyGetPresenceSync(this._buddy);
		this._get_status_id();

		let buddy_custom_icon = proxy.PurpleBlistNodeGetStringSync(this._buddy_contact, 'custom_buddy_icon');
		if (buddy_custom_icon && buddy_custom_icon != 0) {
			this._icon_file = 'file://' + proxy.PurpleBuddyIconsGetCacheDirSync() + '/' + buddy_custom_icon;
		} else {
			let buddy_icon = proxy.PurpleConvImGetIconSync(this._conv_id);
			if (buddy_icon && buddy_icon != 0) {
				this._icon_file = 'file://' + proxy.PurpleBuddyIconGetFullPathSync(buddy_icon);
			} else {
				this._icon_file = false;
			}
		}

		this._buddyStatusChangeId = proxy.connectSignal('BuddyStatusChanged', this._onBuddyStatusChange.bind(this));
		this._buddySignedOffId = proxy.connectSignal('BuddySignedOff', this._onBuddySignedOff.bind(this));
		this._buddySignedOnId = proxy.connectSignal('BuddySignedOn', this._onBuddySignedOn.bind(this));
	}

	destroy() {
		let proxy = this._client.proxy;
		if (this._buddyStatusChangeId > 0) {
			proxy.disconnectSignal(this._buddyStatusChangeId);
			this._buddyStatusChangeId = 0;
		}
		if (this._buddySignedOnId > 0) {
			proxy.disconnectSignal(this._buddySignedOnId);
			this._buddySignedOnId = 0;
		}
		if (this._buddySignedOffId > 0) {
			proxy.disconnectSignal(this._buddySignedOffId);
			this._buddySignedOffId = 0;
		}
		super.destroy();
	}

	_get_status_id() {
		let proxy = this._client.proxy;
		let buddy_status = proxy.PurplePresenceGetActiveStatusSync(this._buddy_presence);
		this._status_id = getStatusCode(proxy.PurpleStatusGetIdSync(buddy_status));
	}

	_makeMessage(author, text, _ts, direction) {
		return makeMessage(text, this._buddy_alias, _ts, direction);
	}

	_onBuddyStatusChange (emitter, something, params) {
		if (params[0] != this._buddy) {
			return;
		}
		let proxy = this._client.proxy;
		this._status_id = getStatusCode(proxy.PurpleStatusGetIdSync(params[2]));
		this._updateStatus();
	}

	_onBuddySignedOff(emitter, something, params) {
		if (params.toString() != this._buddy.toString()){
			return;
		}
		this._get_status_id();
		this._updateStatus();
	}

	_onBuddySignedOn(emitter, something, params) {
		if (params.toString() != this._buddy.toString()) {
			return;
		}
		this._get_status_id();
		this._updateStatus();
	}

	_updateStatus() {
		this._notification.update(this._notification.title, _fixText(this._notification.bannerBodyText), {secondaryGIcon: this.getSecondaryIcon()});
	}
});

const ChatSource = GObject.registerClass(
class ChatSource extends Source {
	_init(client, account, author, conversation) {
		super._init(client, account, author, conversation);
		let proxy = client.proxy;
		this._isChat = true;
		this._cbNames = {};
		this._conv_id = proxy.PurpleConvChatSync(conversation);
		this._status_id = USER_ONLINE;

		let chat_name = proxy.PurpleConversationGetNameSync(conversation);
		let chat_node = proxy.PurpleBlistFindChatSync(account, chat_name[0]);
		let icon = proxy.PurpleBlistNodeGetStringSync(chat_node, 'custom_buddy_icon');
		if(icon && icon != 0)
			this._icon_file = 'file://' + proxy.PurpleBuddyIconsGetCacheDirSync() + '/' + icon;
		else
			this._icon_file = false;
	}

	_makeMessage(author, text, _ts, direction) {
		if(direction == NotificationDirection.RECEIVED &&
				this._cbNames[author] == undefined){
			let proxy = this._client.proxy;
			let buddy = proxy.PurpleFindBuddySync(this._account, author);
			if(buddy==0)
				this._cbNames[author] = author;
			else {
				let alias = proxy.PurpleBuddyGetAliasSync(buddy);
				this._cbNames[author] = alias;
			}
		}

		var author_nick = null;

		if (direction == NotificationDirection.SENT) {
			author_nick = "me";
		} else if (direction == NotificationDirection.RECEIVED) {
			author_nick = this._cbNames[author];
		} else
			author_nick = "";

		return makeMessage('[' + author_nick + ']: ' + text, author, _ts, direction);
	}
});

class PidginSearchProvider {

	constructor(client){
		this._client = client;
		this._enabled = false;
		this._resultSet = [];
	}

	enable() {
		if (!this._enabled){
			try {
				Main.overview._overview._controls._searchController._searchResults._registerProvider(this);
			} catch (e) {
				log(e);
			}
			this._enabled = true;
		}
	}

	disable() {
		if (this._enabled){
			try {
				Main.overview._overview._controls._searchController._searchResults._unregisterProvider(this);
				this.display = null;
			} catch (e) {
				log(e);
			}
			this._enabled = false;
		}
	}

	get appInfo() {
		return null;
	}

	get canLaunchSearch() {
		return false;
	}

	get id() {
		return 'pidgin@muffinmad';
	}

	_createIconForBuddy(buddy, status_code, iconSize) {
		let box = new St.Widget({layout_manager: new Clutter.BinLayout()});
		let p = this._client.proxy;
		var icon_file = false;

		let buddy_custom_icon = p.PurpleBlistNodeGetStringSync(p.PurpleBuddyGetContactSync(buddy), 'custom_buddy_icon');
		if (buddy_custom_icon && buddy_custom_icon != 0) {
			icon_file = p.PurpleBuddyIconsGetCacheDirSync() + '/' + buddy_custom_icon;
		} else {
			let icon = p.PurpleBuddyGetIconSync(buddy);
			if (icon && icon != 0) {
				icon_file = p.PurpleBuddyIconGetFullPathSync(icon);
			}
		}

		if (icon_file) {
			box.add_actor(new St.Icon({
				gicon: new Gio.FileIcon({
					file: Gio.File.new_for_uri('file://' + icon_file)
				}),
				icon_size: iconSize
			}));
		} else {
			box.add_actor(new St.Icon({ gicon: new Gio.ThemedIcon({ name: 'avatar-default' }), icon_size: iconSize}));
		}
		box.add_actor(new St.Icon({
			gicon: getStatusIcon(status_code),
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.END,
			x_expand: true,
			y_expand: true,
			icon_size: iconSize/4
		}));
		return box;
	}

	getResultMeta(result) {
		return {
			id: result.buddy,
			name: result.alias + "\nvia " + result.account_name,
			createIcon: (iconSize) => {
				return this._createIconForBuddy(result.buddy, result.status_code, iconSize);
			}
		};
	}

	getResultMetas(results, cancellable = null) {
		return new Promise((resolve, reject) => {
			const resultMetas = [];
			for (let identifier of results)
				resultMetas.push(this.getResultMeta(this._resultSet[identifier]));
			resolve(resultMetas);
		});
	}

	filterResults(results, maxResults) {
		let res = results.sort(function(b1, b2) {
			let result = b2.status_code - b1.status_code;
			if (result == 0) {
				return b1.alias.toLowerCase().localeCompare(b2.alias.toLowerCase());
			}
			return result;
		});

		return res.slice(0, maxResults);
	}

	_filterBuddys(buddys, terms) {
		return buddys.filter(function(b) {
			let s = b.alias.toLowerCase();
			let a = b.account_name[0].toLowerCase();
			let h = b.handle[0].toLowerCase();
			for (let t in terms) {
				let term = terms[t].toLowerCase();
				let prefix = term.charAt(0);
				if (prefix == "@") {
					if (a.indexOf(term.substr(1)) == -1) {
						return false;
					}
				} else if (prefix == "#") {
					if (h.indexOf(term.substr(1)) == -1) {
						return false;
					}
				} else {
					if (s.indexOf(term) == -1) {
						return false;
					}
				}
			}
			return true;
		});
	}

	_getBuddys(accounts) {
		let p = this._client.proxy;
		let _accounts = accounts.toString().split(',');
		let buddys = [];
		for (let i in _accounts) {
			let acc = _accounts[i];
			let acc_name = p.PurpleAccountGetNameForDisplaySync(acc);
			let b = p.PurpleFindBuddiesSync(acc, '').toString().split(',');
			for (let x in b) {
				let buddy = b[x];
				buddys.push({
					buddy: buddy,
					account_name: acc_name,
					handle: p.PurpleBuddyGetNameSync(buddy),
					alias: p.PurpleBuddyGetAliasSync(buddy).toString(),
					status_code: getStatusCode(p.PurpleStatusGetIdSync(p.PurplePresenceGetActiveStatusSync(p.PurpleBuddyGetPresenceSync(buddy)))),
					toString: function() {
						return buddy;
					}
				});
			}
		}
		return buddys;
	}

	createResultObject(resultMeta) {
		return null;
	}

	searchBuddysByTerms(terms) {
		try {
			let accounts = this._client.proxy.PurpleAccountsGetAllActiveSync();
			return this._filterBuddys(this._getBuddys(accounts), terms);
		} catch (e) {
			log(`PidginBaseSearchProvider::searchByTerms(${terms}): ${e}`);
			return [];
		}
	}

	activateResult(result, terms) {
		let p = this._client.proxy;
		let buddy = this._resultSet[result];
		p.PurpleConversationPresentRemote(p.PurpleConversationNewSync(
			1,
			p.PurpleBuddyGetAccountSync(buddy),
			p.PurpleBuddyGetNameSync(buddy).toString()
		));
	}

	getInitialResultSet(terms, cancellable = null) {
		let provider = this;

		return new Promise((resolve, reject) => {
			try {
				this._resultSet = {};
				for (let buddy of provider.searchBuddysByTerms(terms))
					this._resultSet[buddy.buddy] = buddy;
			} catch (e) {
				log(e);
			}
			resolve(Object.keys(this._resultSet));
		});
	}

	getSubsearchResultSet(results, terms, cancellable = null) {
		return this._filterBuddys(Object.values(this._resultSet), terms);
	}

	filterResults(results, maxResults) {
		return results.slice(0, maxResults);
	}
}

const Pidgin = Gio.DBusProxy.makeProxyWrapper(DBusIface.PidginInterface);

export default class PidginExtension extends Extension {
	enable() {
		this._sources = {};
		this._pending_messages = {};
		this._displayedImMsgId = 0;
		this._setAvailable = 0;
		this._setUnavailable = 0;
		this._disable_timestamp = 0;
		this._searchProvider = null;
		this._messageTrayIntegration = false;

		this._proxy = new Pidgin(Gio.DBus.session, 'im.pidgin.purple.PurpleService', '/im/pidgin/purple/PurpleObject');
		this._settings = this.getSettings();
		this._enableMessageTrayChangeId =
			this._settings.connect(
				'changed::enable-message-tray',
				this._enableMessageTrayChanged.bind(this));
		this._enableSearchProviderChangeId =
			this._settings.connect(
				'changed::enable-search-provider',
				this._enableSearchProviderChanged.bind(this));
		this._enableSearchProviderChanged();
		this._enableMessageTrayChanged();
	}

	disable() {
		this.disableMessageTrayIntegration();
		this.disableSearchProvider();

		if (this._enableSearchProviderChangeId > 0) {
			this._settings.disconnect(this._enableSearchProviderChangeId);
		}
		if (this._enableMessageTrayChangeId > 0) {
			this._settings.disconnect(this._enableMessageTrayChangeId);
		}
		this._proxy = null;
		this._settings = null;
	}

	_enableMessageTrayChanged() {
		if (this._settings.get_boolean('enable-message-tray')) {
			this.enableMessageTrayIntegration();
		} else {
			this.disableMessageTrayIntegration();
		}
	}

	_enableSearchProviderChanged() {
		if (this._settings.get_boolean('enable-search-provider')) {
			this.enableSearchProvider();
		} else {
			this.disableSearchProvider();
		}
	}

	enableMessageTrayIntegration() {
		if (this._messageTrayIntegration) {
			return;
		}

		this._displayedImMsgId = this._proxy.connectSignal('DisplayedImMsg', this._messageDisplayedIm.bind(this));
		this._displayedChatMsgId = this._proxy.connectSignal('DisplayedChatMsg', this._messageDisplayedChat.bind(this));
		this._deleteConversationId = this._proxy.connectSignal('DeletingConversation', this._onDeleteConversation.bind(this));
		this._conversationUpdatedId = this._proxy.connectSignal('ConversationUpdated', this._onConversationUpdated.bind(this));

		// existing conversations
		try {
			let conversations = this._proxy.PurpleGetImsSync().toString().split(',');
			for (let i in conversations) {
				let conv = conversations[i];
				if (!conv || conv == null) continue;
				let messages = this._proxy.PurpleConversationGetMessageHistorySync(conv).toString().split(',');
				let history = [];
				let account = this._proxy.PurpleConversationGetAccountSync(conv);
				for (let x in messages) {
					let mess = messages[x];
					if (!mess || mess == null) continue;
					history.push({
						conv: conv,
						account: account,
						author: this._proxy.PurpleConversationMessageGetSenderSync(mess).toString(),
						text: this._proxy.PurpleConversationMessageGetMessageSync(mess),
						flag: this._proxy.PurpleConversationMessageGetFlagsSync(mess),
						timestamp: this._proxy.PurpleConversationMessageGetTimestampSync(mess)
					});
				}
				if (history.length == 0) continue;
				history = history.sort(function(m1, m2) {
					return m1.timestamp - m2.timestamp;
				});
				for (let x in history) {
					let h = history[x];
					this._handleMessage(h.account, h.author, h.text, h.conv, h.flag, h.timestamp, false);
				}
			}
		} catch (e) {
			log(e);
		}
		this._messageTrayIntegration = true;
	}

	enableSearchProvider() {
		if (this._searchProvider == null) {
			this._searchProvider = new PidginSearchProvider(this);
		}
		this._searchProvider.enable();
	}

	disableMessageTrayIntegration() {
		if (! this._messageTrayIntegration) {
			return;
		}

		this._disable_timestamp = Date.now() / 1000;
		if (this._displayedImMsgId > 0) {
			this._proxy.disconnectSignal(this._displayedImMsgId);
			this._displayedImMsgId = 0;
		}
		if (this._displayedChatMsgId > 0) {
			this._proxy.disconnectSignal(this._displayedChatMsgId);
			this._displayedChatMsgId = 0;
		}
		if (this._deleteConversationId > 0) {
			this._proxy.disconnectSignal(this._deleteConversationId);
			this._deleteConversationId = 0;
		}
		if (this._conversationUpdatedId > 0) {
			this._proxy.disconnectSignal(this._conversationUpdatedId);
			this._conversationUpdatedId = 0;
		}

		for (let key in this._sources) {
			if (this._sources.hasOwnProperty(key)) {
				let src = this._sources[key];
				this._pending_messages[key] = src._pendingMessages;
				src.destroy();
			}
		}
		this._messageTrayIntegration = false;
	}

	disableSearchProvider() {
		if (this._searchProvider != null) {
			this._searchProvider.disable();
		}
	}

	get disable_timestamp() {
		return this._disable_timestamp;
	}

	get proxy() {
		return this._proxy;
	}

	get searchProvider() {
		return this._searchProvider;
	}

	_onDeleteConversation(emitter, something, conversation) {
		let source = this._sources[conversation];
		if (source) {
			source.destroy();
		}
	}

	_onConversationUpdated(emitter, something, params) {
		if (params[1] != 4) return;
		let source = this._sources[params[0]];
		if (!source) return;
		let focus = this._proxy.PurpleConversationHasFocusSync(params[0]);
		if (focus == 1) {
			source._markAllSeen();
		}
	}

	_handleMessage(account, author, message, conversation, flag, timestamp, isChat) {
		if (flag & 0x200) flag |= 2; // treat error message as received message
		if (flag & 3 == 0) return; // nor send or receive message
		var source = this._sources[conversation];
		if (!source) {
			if (isChat) {
				if (this._settings.get_boolean('chat-highlight-only') && flag != 34) return;
				source = new ChatSource(this, account, author, conversation);
			} else {
				source = new ImSource(this, account, author, conversation);
			}
			let pm = this._pending_messages[conversation];
			if (pm) {
				source._pendingMessages = pm;
				source.countUpdated();
				delete this._pending_messages[conversation];
			}
			source.connect('destroy', () => {
				delete this._sources[conversation];
			});
			this._sources[conversation] = source;
		}
		source.handleMessage(author, message, flag, timestamp);
	}

	_messageDisplayed(details, isChat) {
		var account = details[0];
		var author = details[1];
		var message = details[2];
		var conversation = details[3];
		var flag = details[4];

		this._handleMessage(account, author, message, conversation, flag, null, isChat);
	}

	_messageDisplayedIm(emitter, something, details){
		this._messageDisplayed(details, false);
	}

	_messageDisplayedChat(emitter, something, details){
		this._messageDisplayed(details, true);
	}
};
