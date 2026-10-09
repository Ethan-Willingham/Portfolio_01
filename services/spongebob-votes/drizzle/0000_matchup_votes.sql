CREATE TABLE matchup_votes (
  pair_a TEXT NOT NULL,
  pair_b TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  winner TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (pair_a, pair_b, voter_hash),
  CHECK (pair_a < pair_b),
  CHECK (winner = pair_a OR winner = pair_b)
);
