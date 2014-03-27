// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

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
	Extends: Gtk.Box,

	_init: function(params) {
		this.parent(params);
		this._settings = Convenience.getSettings();

		this.margin = 24;
		this.spacing = 30;
		let label = new Gtk.Label({
			label: _('Buddies search provider'),
			hexpand: true,
			halign: Gtk.Align.START});
		let checkbox = new Gtk.Switch({
			halign: Gtk.Align.END});
		checkbox.set_active(this._settings.get_boolean('enable-search-provider'));
		checkbox.connect(
			'notify::active',
			Lang.bind(this, function(check) {
				this._settings.set_boolean('enable-search-provider', check.get_active());
			})
		);
		this.add(label);
		this.add(checkbox);
	},
});


function buildPrefsWidget() {
	let widget = new PidginPrefsWidget();
	widget.show_all();

	return widget;
}
