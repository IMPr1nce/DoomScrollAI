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
// vp.js picks one at random and never repeats a VP's last few lines (MESSAGE_NO_REPEAT in
// config.js), so with ~14 lines per category a VP rarely sounds the same twice.
// Keep everything friendly and 13-year-old appropriate, and SHORT: a line must fit on one
// line of a small profile card (tests.html checks the length), or the card would jump.
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
    'Ha! Can\'t look away.',
    'Okay, I could watch this all day.',
    'Now THIS is a good feed.',
    'Save this one for later!',
    'Wow, that was actually good.'
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
    'Meh.',
    'Nope. Next one, please.',
    'Skipping that one.',
    'Not for me.',
    'Yawn. Pass.'
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
    'Feels like déjà vu…',
    'Wait, more {topic}?',
    'Okay, I get it. {topic}!',
    'My feed is stuck on {topic}.',
    'Same thing, different post.'
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
    'I\'m about to close this.',
    'Is this thing on?',
    'Can I get something good?',
    'My feed is so boring now.',
    'I\'m about to check my messages.'
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
    'Phone down. See ya.',
    'Okay, bye. For real this time.',
    'I\'m off to play a game.',
    'Logging off. See ya!',
    'That\'s enough scrolling.'
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
    'Whoa, how long have I been on here?',
    'Just five more minutes…',
    'My thumb keeps scrolling.',
    'I meant to stop an hour ago.',
    'Why is this so hard to put down?'
  ]
};

// Topic-flavored reactions, for the two most common categories. A liked or disliked reaction
// uses one of these about TOPIC_MESSAGE_CHANCE of the time, so Sports sounds like Sports.
// They only repeat what the player already learned from the like/skip itself, so they don't
// give away anything about the hidden tastes.
DS.TOPIC_MESSAGES = {
  sports: {
    liked:    ['What a play!', 'That goal was unreal.', 'I need to try that move.', 'Great game highlights!'],
    disliked: ['Not really a sports fan.', 'I\'ll skip the game.', 'No sports for me.', 'Can\'t follow the score.']
  },
  dance: {
    liked:    ['Those moves are so smooth!', 'I\'m learning this dance.', 'Okay, that routine!', 'I\'m dancing at my desk now.'],
    disliked: ['I have two left feet.', 'Not into dance videos.', 'Dance? Skip.', 'I\'ll sit this one out.']
  },
  music: {
    liked:    ['This song is stuck in my head!', 'Adding this to my playlist.', 'Great beat!', 'Turn it up!'],
    disliked: ['Not my kind of music.', 'Too loud for me.', 'Skip this song.', 'Not feeling this track.']
  },
  comics: {
    liked:    ['Ha! That panel is so good.', 'I love this art style.', 'Okay, that plot twist!', 'Is there a next issue?'],
    disliked: ['Comics aren\'t my thing.', 'Can\'t get into comics.', 'Not into comics.', 'I\'ll skip the comic.']
  },
  movies: {
    liked:    ['I need to watch this movie.', 'Okay, great trailer!', 'That ending though!', 'Movie night idea!'],
    disliked: ['Not a movie person today.', 'No trailers, please.', 'Movies take too long.', 'Pass on this movie.']
  },
  food: {
    liked:    ['Now I\'m hungry.', 'That looks so tasty!', 'I need to make that.', 'Snack time!'],
    disliked: ['Not hungry right now.', 'I don\'t like that dish.', 'Not my kind of food.', 'Skip the recipe.']
  }
};
