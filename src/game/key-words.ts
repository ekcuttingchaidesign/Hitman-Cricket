/**
 * The words a career key is made of.
 *
 * Two hundred and fifty-six of them, which is eight bits each: three words
 * and two digits are twenty-four bits of word and a hundred of digit, about
 * 1.7 billion keys. Paired with a name that must also be right, that is far
 * more than anybody can work through against a store that counts attempts.
 *
 * The rules the list keeps, and why each one is worth the words it costs:
 *
 * Four to seven letters. Under four and the words stop being words; over
 * seven and a key stops fitting on one line of a phone, which is the line
 * somebody reads it back from.
 *
 * No two share their first four letters. A key is typed by hand by somebody
 * who has written it on paper, and four letters is where a guess becomes
 * certain — so `spri` can only ever be `sprint`, never `spring` as well.
 * This is what a decoder that forgives typing can be built on later.
 *
 * No two sound alike. `caught` and `court` were both here and one of them had
 * to go: read down a phone line they are the same word in most accents, and a
 * key you cannot say to somebody is a key that only survives copy and paste.
 * Words that rhyme with something outside the list are fine — `medal` may be
 * heard as `meddle`, but `meddle` opens nothing, so the attempt fails loudly
 * rather than silently restoring the wrong record.
 *
 * All of them from the game and its neighbours: cricket, the gym, the track,
 * the season. A key should read like it came from this game and not from a
 * password generator, because the thing it protects is a cricket career.
 *
 * Changing this list does not break a key already issued: what is kept is a
 * salted hash of the words as written, not the places they sit here. The
 * order is still worth leaving alone — it costs nothing and it keeps the two
 * ends of any future decoder agreeing.
 */
export const KEY_WORDS: readonly string[] = [
  'appeal', 'bails', 'batting', 'bouncer', 'bowler', 'caught',
  'chase', 'cover', 'crease', 'defend', 'deliver', 'drive',
  'duck', 'edged', 'fielder', 'flick', 'glance', 'gloves',
  'googly', 'guard', 'gully', 'helmet', 'innings', 'keeper',
  'length', 'maiden', 'middle', 'nudge', 'offside', 'opener',
  'overs', 'paddle', 'partner', 'pitch', 'point', 'pulled',
  'review', 'ropes', 'runner', 'scoop', 'scored', 'seamer',
  'session', 'shot', 'single', 'sixer', 'slips', 'spell',
  'spinner', 'square', 'stance', 'stride', 'stumps', 'sweep',
  'swing', 'target', 'thrown', 'umpire', 'wicket', 'yorker',
  'bumper', 'cutter', 'flight', 'hooked', 'leave', 'nicked',
  'pacer', 'runup', 'skipper', 'sledge', 'topspin', 'batsman',
  'cricket', 'declare', 'lofted', 'reverse', 'shuffle', 'stadium',
  'whacked', 'century', 'fifty', 'legside', 'onside', 'wides',
  'oval', 'ashes', 'eleven', 'third', 'second', 'hitter',
  'ramped', 'switch', 'timing', 'drifted', 'active', 'agility',
  'aerobic', 'barbell', 'bench', 'bicep', 'block', 'boost',
  'burpee', 'cadence', 'calves', 'cardio', 'circuit', 'climb',
  'crunch', 'curls', 'cycle', 'dash', 'drill', 'effort',
  'energy', 'fitness', 'flex', 'gains', 'grip', 'hurdle',
  'incline', 'intense', 'jogging', 'jumps', 'kettle', 'lifted',
  'lunge', 'muscle', 'plank', 'power', 'press', 'pulse',
  'pumped', 'pushup', 'reps', 'rested', 'rowing', 'sprint',
  'stamina', 'stretch', 'tempo', 'tread', 'warmup', 'weights',
  'workout', 'yoga', 'dynamic', 'endure', 'hydrate', 'impact',
  'posture', 'routine', 'tendon', 'torque', 'vitals', 'balance',
  'breathe', 'elbow', 'forearm', 'kneecap', 'ladder', 'mileage',
  'oxygen', 'pacing', 'quads', 'shuttle', 'thighs', 'upright',
  'burnout', 'calorie', 'fatigue', 'gymnast', 'kicking', 'lateral',
  'neutral', 'rower', 'triceps', 'unwind', 'volume', 'trainer',
  'motion', 'engine', 'focus', 'summit', 'grind', 'vault',
  'arena', 'athlete', 'captain', 'coach', 'contest', 'derby',
  'dugout', 'fixture', 'goalie', 'jersey', 'league', 'medal',
  'podium', 'referee', 'rival', 'rookie', 'season', 'title',
  'trophy', 'victory', 'whistle', 'winner', 'dribble', 'fanbase',
  'lineup', 'match', 'penalty', 'playoff', 'ranking', 'sponsor',
  'tactics', 'veteran', 'anthem', 'banner', 'crowd', 'debut',
  'final', 'glory', 'legend', 'mascot', 'record', 'upset',
  'relay', 'tackle', 'netball', 'hockey', 'rugby', 'tennis',
  'soccer', 'boxing', 'swimmer', 'diving', 'archery', 'fencing',
  'karate', 'skating', 'surfing', 'mentor', 'morning', 'javelin',
  'hammer', 'anchor', 'ankle', 'attack', 'blast', 'charge',
  'boots', 'fast', 'tossed', 'turned',
];

/** How many words there are, and so how many a single word is worth. */
export const KEY_WORD_BITS = 8;
