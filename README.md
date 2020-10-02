ws-lobby-tools
==============

Welcome! This is a WebSocket and TCP compatible lobby system that allows both
kinds of sockets to communicate on one lobby system. We use jsonrpc 2 with a
slight change to allow for relaying information. This should allow quicker
communication for clients relaying information inside of a room (e.g. a game
session, setting a game session up, or just a cool chat room/lobby).

The lobby is made to be as friendly as possible for all kinds of developers,
and allowing some easy modification for specific implementations.

The approach may be slightly confusing to some, but should prove easy once
learnt. JSONRPC is normally used for a client to execute methods on a server
remotely, and sometimes to make it seem as natural as possible.

This kind of JSON RPC is used as 2-way communication, such that a client can
send messages, or create/change rooms, yet clients can receive messages and
notification events with the same JSON protocol (more client-to-client). The
methods implemented in the lobby can be tailored to your own design, and
mostly exist as sane defaults.

There's most likely a few unforeseen bugs as the unit tests have not yet been
completed. If you discover a bug, you're welcome to submit a ticket, or if
you've developed a feature you feel should be included, feel free to make
a pull request and submit your best ideas.

Make sure if you do want to push fixes or new features, that it follows the
code requirements:

- Keep it simple (KISS)
- Return-early/negate approach
- No yoda (1 == value)
- Tidy 80-char comments
- Keep indentation small
- camelCaps
- Keep indentation minimal and consistent
- Good spelling and grammar where possible

Features:
- WebSocket/TCP communication (see examples)
- Lobby area (messaging, user/room list, join/create rooms)
- Rooms for games/chat areas with text relay
- User roles for simple permissions:
		- guest
		- lobby.member
		- lobby.moderator
		- lobby.admin
		- room.member
		- room.moderator
		- room.admin
- Notifications for user/room/lobby events
- Allows RPC method expansion
- ping/heartbeat
- Chat Lobby - Tiny chat example project with basic features
	It's not much but it should show what it can be capable of.
	- '/slash' commands allows quoted strings, and interprets argument types
	- Typing recognition allows others to see user activity
	- Private message and room to demo lobby rooms
	- Random colored usernames
	- set user/room/users additional data
