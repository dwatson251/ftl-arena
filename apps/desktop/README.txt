FTL ARENA - 1v1 real-time FTL with your friends
================================================

You need your own copy of FTL: Faster Than Light (1.6 or later: Steam, GOG or Humble).
Nothing from FTL comes with this app: on first start it reads the game's data from your install.

1. Windows: unzip this folder anywhere (e.g. your Desktop) and run "FTL Arena.exe".
   Windows may say "Windows protected your PC": click "More info", then "Run anyway"
   (the app isn't signed). When Windows asks about the firewall, click Allow.
   Linux: unpack the folder and run "ftl-arena" (or use the AppImage).
   Steam Deck: use FTL-Arena-x86_64.AppImage. In Desktop Mode, right-click it >
   Properties > Permissions > "Is executable", then in Steam: Add a Non-Steam Game.
   In Gaming Mode it runs fullscreen with controller support on.
2. First start: pick your FTL folder (the one with ftl.dat), e.g.
   C:\Program Files (x86)\Steam\steamapps\common\FTL Faster Than Light
   ~/.local/share/Steam/steamapps/common/FTL Faster Than Light   (Linux, Steam Deck)
   (in Steam: right-click FTL > Manage > Browse local files). Steam installs are found by themselves.
3. "Single player → Create a match" works straight away.

Playing with a friend
---------------------
Same network (LAN tab):
 - Host: Create match, tell your friend the 4-letter code.
 - Friend: LAN tab, type the code, Join.

Over the internet (Online tab):
 - Host: leave the server address blank and press Create match. The lobby shows the address
   to give your friend. The app tries to open the port on your router by itself; if your
   friend can't connect, forward TCP port 8787 on your router to your computer.
 - Friend: Online tab, type the host's address (e.g. 81.2.3.4:8787) and the code, Join.

Dedicated server (Online tab): everyone types the server's address. Whoever creates the match
shares the code; the others type the address and the code and press Join.

If a LAN code isn't found straight away, the app also checks each address on your network
directly (a few seconds). Online with the host's address always works as well.

The menu bar is hidden; Ctrl+Shift+F12 shows it (reload, fullscreen, developer tools).

Your data (settings, the unpacked FTL files) lives in %APPDATA%\FTL Arena on Windows and
~/.config/FTL Arena on Linux; delete that folder to start over.

This is an alpha playtest build: https://github.com/dwatson251/ftl-arena
FTL: Faster Than Light is (c) Subset Games. FTL Arena is an unofficial fan project, not affiliated
with Subset Games. Get FTL at https://subsetgames.com/ftl.html
