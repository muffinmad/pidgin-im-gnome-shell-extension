pidgin-im-gnome-shell-extension
===============================

Make Pidgin IM conversations appear in the Gnome Shell message tray

Supports only IMs for now (i.e. no chats, file transfers or attentions).

Issues:
- Messages appear unseen in Pidgin after expanding notification in message tray. Don't know how to set unseen state in Pidgin
- No notifications on locked screen even if notification settings allow it. Because Gnome Shell disables all extensions on screen lock

Features:
- User icons
- User status as secondary icon
- Sends typing state
- Shows unread messages count
- Tries to restore unread messages count after screen lock/unlock
- Search provider for buddys from connected accounts

Tested on Gnome Shell 3.10 and Pidgin 2.10.9 with Jabber protocol.

