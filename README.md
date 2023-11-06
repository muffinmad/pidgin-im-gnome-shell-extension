[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner2-direct.svg)](https://stand-with-ukraine.pp.ua)

# pidgin-im-gnome-shell-extension

Make Pidgin IM conversations appear in the Gnome Shell message tray

## Features

- Supports Chats and IMs for now (i.e. no file transfers or attentions)
- User icons
- User status as secondary icon
- Sends typing state
- Shows unread messages count
- Tries to restore unread messages count after screen lock/unlock
- Search provider for buddys from connected accounts (can be disabled from extension preferences)

## Issues

- Messages appear unseen in Pidgin after expanding notification in message tray. Don't know how to set unseen state in Pidgin
- No notifications on locked screen even if notification settings allow it. Because Gnome Shell disables all extensions on screen lock

## Supported Gnome Shell Versions

Recent master version supports latest Gnome Shell version. Versions with for older Gnome Shell support can be found on extensions.gnome.org.

## Installation

### GNOME Shell Extensions

https://extensions.gnome.org/extension/782/pidgin-im-integration/

### Manual
    mkdir -p $HOME/.local/share/gnome-shell/extensions
    cd $HOME/.local/share/gnome-shell/extensions
    git clone git://github.com/muffinmad/pidgin-im-gnome-shell-extension.git pidgin@muffinmad
Restart GNOME Shell and enable "Pidgin IM integration" extension
