Doomscroll AI saves its data here.

The saving program writes every file. Start it once per class, from the game's folder:

  python3 server.py

then open http://localhost:8765 in Chrome (or any browser). Keep its window open while the class plays.
The name screen says "✓ Saving program is running." when it is ready.

  data/
    First_Last/         one folder per student: First_Last_tutorial.csv, First_Last_round1.csv, ...
    leaderboard/        leaderboard.csv: one row per round played on this laptop

Files are never written over: a student who plays again later gets "First_Last_round1 (2).csv".
To start a fresh leaderboard (a new class), delete or rename leaderboard/leaderboard.csv.
The README in the game's folder explains every column.
