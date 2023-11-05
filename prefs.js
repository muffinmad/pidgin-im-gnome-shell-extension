import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PidginPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		window._settings = this.getSettings();

		const page = new Adw.PreferencesPage({
			title: 'Pidgin IM Integration',
			icon_name: 'dialog-information-symbolic',
		});
		window.add(page);
		const group = new Adw.PreferencesGroup();
		page.add(group);

		let row = new Adw.SwitchRow({title: _('Message tray integration')});
		group.add(row);
		window._settings.bind('enable-message-tray', row, 'active', Gio.SettingsBindFlags.DEFAULT);

		row = new Adw.SwitchRow({title: _('Buddies search provider')});
		group.add(row);
		window._settings.bind('enable-search-provider', row, 'active', Gio.SettingsBindFlags.DEFAULT);

		row = new Adw.SwitchRow({title: _('Track only highlighted messages for chats')});
		group.add(row);
		window._settings.bind('chat-highlight-only', row, 'active', Gio.SettingsBindFlags.DEFAULT);

		row = new Adw.SwitchRow({title: _('Reopen notification banner on notification click')});
		group.add(row);
		window._settings.bind('reopen-banner', row, 'active', Gio.SettingsBindFlags.DEFAULT);
	}
}
