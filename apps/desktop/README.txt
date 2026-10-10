FTL ARENA - 1v1 real-time FTL with your friends
================================================

You need your own copy of FTL: Faster Than Light (1.6 or later: Steam, GOG or Humble).
Nothing from FTL comes with this app: on first start it reads the game's data from your install.

1. Unzip this folder anywhere (e.g. your Desktop) and run "FTL Arena.exe".
   Windows may say "Windows protected your PC": click "More info", then "Run anyway"
   (the app isn't signed). When Windows asks about the firewall, click Allow.
2. First start: pick your FTL folder (the one with ftl.dat), e.g.
   C:\Program Files (x86)\Steam\steamapps\common\FTL Faster Than Light
   (in Steam: right-click FTL > Manage > Browse local files).
3. "Practice vs bot" works straight away.

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

Your data (settings, the unpacked FTL files) lives in %APPDATA%\FTL Arena; delete that folder
to start over.
