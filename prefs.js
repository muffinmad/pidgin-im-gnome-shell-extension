const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Config = imports.misc.config;

const Gettext = imports.gettext.domain('gnome-shell-extension-pidgin');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;


function init() {
	Convenience.initTranslations();
}

const PidginPrefsWidget = new GObject.Class({
	Name: 'Pidgin.Prefs.Widget',
	GTypeName: 'PidginPrefsWidget',
	Extends: Gtk.Grid,

	_init: function(params) {
		this.parent(params);
		this.row_spacing = 10;
		this._settings = Convenience.getSettings();

		this.margin = 24;
		this.spacing = 30;
		let msg_label = new Gtk.Label({
			label: _('Message tray integration'),
			hexpand: true,
			halign: Gtk.Align.START});
		let msg_checkbox = new Gtk.Switch({
			halign: Gtk.Align.END});
		msg_checkbox.set_active(this._settings.get_boolean('enable-message-tray'));
		msg_checkbox.connect(
			'notify::active',
			(check) => {
				this._settings.set_boolean('enable-message-tray', check.get_active());
			}
		);
		this.attach(msg_label, 0, 1, 1, 1);
		this.attach(msg_checkbox, 1, 1, 1, 1);

		let buddy_label = new Gtk.Label({
			label: _('Buddies search provider'),
			hexpand: true,
			halign: Gtk.Align.START});
		let buddy_checkbox = new Gtk.Switch({
			halign: Gtk.Align.END});
		buddy_checkbox.set_active(this._settings.get_boolean('enable-search-provider'));
		buddy_checkbox.connect(
			'notify::active',
			(check) => {
				this._settings.set_boolean('enable-search-provider', check.get_active());
			}
		);
		this.attach(buddy_label, 0, 2, 1, 1);
		this.attach(buddy_checkbox, 1, 2, 1, 1);

		let chat_hl_label = new Gtk.Label({
			label: _('Track only highlighted messages for chats'),
			hexpand: true,
			halign: Gtk.Align.START});
		let chat_hl_checkbox = new Gtk.Switch({
			halign: Gtk.Align.END});
		chat_hl_checkbox.set_active(this._settings.get_boolean('chat-highlight-only'));
		chat_hl_checkbox.connect(
			'notify::active',
			(check) => {
				this._settings.set_boolean('chat-highlight-only', check.get_active());
			}
		);
		this.attach(chat_hl_label, 0, 3, 1, 1);
		this.attach(chat_hl_checkbox, 1, 3, 1, 1);

		let reopen_banner_label = new Gtk.Label({
			label: _('Reopen notification banner on notification click'),
			hexpand: true,
			halign: Gtk.Align.START});
		let reopen_banner_checkbox = new Gtk.Switch({
			halign: Gtk.Align.END});
		reopen_banner_checkbox.set_active(this._settings.get_boolean('reopen-banner'));
		reopen_banner_checkbox.connect(
			'notify::active',
			(check) => {
				this._settings.set_boolean('reopen-banner', check.get_active());
			}
		);
		this.attach(reopen_banner_label, 0, 4, 1, 1);
		this.attach(reopen_banner_checkbox, 1, 4, 1, 1);
	},
});


function buildPrefsWidget() {
	let widget = new PidginPrefsWidget();
	return widget;
}
