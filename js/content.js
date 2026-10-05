/*
 * content.js — all the "words and people" of the game: topics, VP definitions,
 * message templates. No logic, no numbers that affect balance (those are in
 * config.js). To re-skin the game, edit this file only.
 */
window.DS = window.DS || {};

// ------------------------------------------------------------------- Topics
// Order here is the order the buttons appear on each card.
// Colors are for decoration only. The emoji + label carry the meaning, so the
// game still works for colorblind players.
DS.TOPICS = [
  { id: 'sports', label: 'Sports', emoji: '⚽', color: '#2fa84f' },
  { id: 'dance',  label: 'Dance',  emoji: '💃', color: '#e0489a' },
  { id: 'music',  label: 'Music',  emoji: '🎵', color: '#7a4fe0' },
  { id: 'comics', label: 'Comics', emoji: '💥', color: '#f08a1c' },
  { id: 'movies', label: 'Movies', emoji: '🎬', color: '#2f7fe0' },
  { id: 'food',   label: 'Food',   emoji: '🍕', color: '#d9a400' }
];

// Lookup tables so other code never loops just to find a topic.
DS.TOPIC_IDS = DS.TOPICS.map(function (t) { return t.id; });
DS.TOPIC_BY_ID = {};
DS.TOPICS.forEach(function (t) { DS.TOPIC_BY_ID[t.id] = t; });

// ---------------------------------------------------------------------- VPs
// A VP definition only says who they are and which topics they like. The
// actual probabilities are built in vp.js from config (TASTE_FAVORITE, etc.).
//   favorites: ~0.85 like chance    meh: ~0.5    everything else: ~0.15
// Avatars are animals on purpose: they look like profile pics and don't
// imply any gender, skin tone, or look.
// Each VP has a different mix, so players have to learn each one separately.

// Used only in the two tutorials.
DS.TUTORIAL_VP_DEF = {
  id: 'alex', name: 'Alex', avatar: '🦊', bio: '13, likes hanging with friends',
  favorites: ['music', 'food'],
  meh: ['movies', 'dance']
  // sports + comics are disliked: easy to find, and easy to use in tutorial 2
};

// The six VPs in the main game.
DS.VP_DEFS = [
  { id: 'maya',   name: 'Maya',   avatar: '🐼', bio: '13, plays soccer every weekend',
    favorites: ['sports'],            meh: ['food', 'movies'] },
  { id: 'jordan', name: 'Jordan', avatar: '🐙', bio: '14, always dancing in the kitchen',
    favorites: ['dance', 'music'],    meh: ['food', 'movies'] },
  { id: 'sam',    name: 'Sam',    avatar: '🐸', bio: '13, draws comics at lunch',
    favorites: ['comics'],            meh: ['movies', 'music'] },
  { id: 'riley',  name: 'Riley',  avatar: '🦄', bio: '13, movie night every Friday',
    favorites: ['movies', 'food'],    meh: ['music', 'comics'] },
  { id: 'devon',  name: 'Devon',  avatar: '🐯', bio: '14, loves trying new snacks',
    favorites: ['food'],              meh: ['sports', 'dance'] },
  { id: 'priya',  name: 'Priya',  avatar: '🐱', bio: '13, makes a playlist for everything',
    favorites: ['music', 'comics'],   meh: ['dance', 'sports'] }
];

// ----------------------------------------------------------------- Messages
// Speech-bubble lines. {topic} is replaced with the topic's label ("Sports").
// vp.js picks one at random and never shows the same line twice in a row for
// the same VP. Keep everything friendly and 13-year-old appropriate.
//
//   liked / disliked : normal reaction to a post
//   fatigued         : the same topic keeps coming
//   lowAttention     : attention is below LOW_ATTENTION_THRESHOLD
//   afk              : the VP just left
//   hooked           : the VP is stuck in a narrow loop (the lesson, in a quiet way)
DS.MESSAGES = {
  liked: [
    'Ooh, nice!',
    'Okay, this is good.',
    'Haha, I like this one!',
    'Yes! More like this.',
    'Wait, this is actually great.',
    'This is my kind of post.',
    'Okay, you get me.',
    'I\'m sending this to my friends.',
    'Love it!',
    'Ha! Can\'t look away.'
  ],
  disliked: [
    'Nah, skip.',
    'Not feeling {topic} right now.',
    'Boring. Next!',
    'Eh, no thanks.',
    'Scrolling past that.',
    'Ugh, not this.',
    'Why am I seeing this?',
    'I don\'t care about {topic}.',
    'Hard pass.',
    'Meh.'
  ],
  fatigued: [
    '{topic} again? Okay…',
    'Didn\'t I just see this?',
    'More {topic}? Hmm.',
    'Same stuff again…',
    'I think I\'ve seen enough {topic}.',
    'Kinda repeating, huh?',
    'Okay, that\'s a lot of {topic}.',
    'Can we change it up?',
    'Again? Really?',
    'Feels like déjà vu…'
  ],
  lowAttention: [
    'Hello? Anything good?',
    'I\'m getting bored here…',
    'This feed is kinda dead.',
    'Maybe I\'ll check my other apps.',
    'Is there anything fun?',
    'My thumb is getting tired…',
    'I might go do my homework… maybe.',
    'Zzz… wake me up.',
    'Show me something good!',
    'I\'m about to close this.'
  ],
  afk: [
    'Okay, I\'m out. Bye!',
    'Closing the app.',
    'Done. Going outside.',
    'That\'s it. I\'m gone.',
    'Time to do something else.',
    'Bye bye, feed!',
    'I\'m logging off.',
    'Nope, I\'m done.',
    'Going to find my friends.',
    'Phone down. See ya.'
  ],
  hooked: [
    'Ok, one more…',
    'Wait, it\'s 1am??',
    'Why do I keep watching this?',
    'Just one more, I promise.',
    'I can\'t stop scrolling.',
    'Wait, where did the time go?',
    'I only opened the app for a sec…',
    'Okay, last one. For real.',
    'I should stop. But… one more.',
    'Whoa, how long have I been on here?'
  ]
};
