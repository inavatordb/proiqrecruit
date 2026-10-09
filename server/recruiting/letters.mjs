/**
 * Platform-owned recruiting letter templates.
 *
 * These live in code, not in the database: no athlete (and no API call) can edit them, so a player's own copy can never change
 * the starting point for everyone else, and a future edit to a default never rewrites a copy an athlete already saved
 * (copies remember which version they started from). `[Bracketed Text]` is a placeholder: the composer fills what the profile and
 * program already know and flags everything else before an email can be opened.
 */
export const DEFAULTS_VERSION = 1;

/** Placeholders the composer can fill from data we already hold (everything else is written by the athlete). */
export const KNOWN_PLACEHOLDERS = [
  'Coach First Name', 'Coach Last Name', 'College Name', 'Player Name', 'Graduation Year', 'Position', 'Club or High School Team',
  'Academic Interests', 'Highlight Video Link', 'Player Contact Information',
];
/** Placeholders only the athlete can truthfully fill. */
export const PERSONAL_PLACEHOLDERS = [
  'Why I Am Interested in Your Program', 'Recent Development or Performance', 'Upcoming Tournament Dates and Location',
  'Tournament Name', 'Schedule Link', 'Specific Observation About the Team', 'Thank You Detail',
];

export const DEFAULT_TEMPLATES = [
  {
    key: 'initial-introduction', name: 'Initial Introduction', description: 'First message to a coach: who you are and why this program.',
    subject: '[Graduation Year] [Position] interested in [College Name] soccer – [Player Name]',
    body: `Dear Coach [Coach Last Name],

My name is [Player Name], and I am a [Graduation Year] [Position] playing for [Club or High School Team]. I am writing to introduce myself and to let you know I am interested in the women's soccer program at [College Name].

[Why I Am Interested in Your Program]

Academically, I am interested in [Academic Interests]. I would like to find a school where I can compete in soccer and do well in the classroom.

You can watch my highlights here:
[Highlight Video Link]

I would appreciate any advice on how I can best get on your radar, and I would be glad to send my schedule, transcript, or references if that would help.

Thank you for your time.

Sincerely,
[Player Name]
[Player Contact Information]`,
  },
  {
    key: 'follow-up-progress', name: 'Follow-Up and Progress Update', description: 'Reconnect after an introduction with an honest update.',
    subject: 'Following up – [Player Name], [Graduation Year] [Position]',
    body: `Dear Coach [Coach Last Name],

I wrote to you earlier about my interest in [College Name]. I wanted to follow up and share a short update.

[Recent Development or Performance]

I will be playing at [Upcoming Tournament Dates and Location] and would be glad to send the full schedule if you are able to attend or have someone watch.

My most recent highlights are here:
[Highlight Video Link]

I remain very interested in your program. Please let me know if there is anything else you would like from me.

Thank you,
[Player Name]
[Graduation Year] [Position] | [Club or High School Team]
[Player Contact Information]`,
  },
  {
    key: 'tournament-schedule', name: 'Upcoming Tournament or Match Schedule', description: 'Tell a coach where and when you will play.',
    subject: '[Player Name] ([Graduation Year] [Position]) – schedule for [Tournament Name]',
    body: `Dear Coach [Coach Last Name],

I am a [Graduation Year] [Position] with [Club or High School Team] and I am very interested in [College Name]. I wanted to share where I will be playing in case your schedule allows you to watch.

Event: [Tournament Name]
Dates and location: [Upcoming Tournament Dates and Location]
Full schedule: [Schedule Link]

If you would like my game times or jersey number closer to the event, I will gladly send them. My highlights are here if you would like to see my game first:
[Highlight Video Link]

Thank you for considering me.

Sincerely,
[Player Name]
[Player Contact Information]`,
  },
  {
    key: 'new-highlights-update', name: 'New Highlights and Performance Update', description: 'Share new footage and recent progress.',
    subject: 'New highlights – [Player Name], [Graduation Year] [Position]',
    body: `Dear Coach [Coach Last Name],

I have put together new highlights from this season and wanted to share them with you, because [College Name] is still a school I am very interested in.

[Recent Development or Performance]

New highlights:
[Highlight Video Link]

Academically, I continue to focus on [Academic Interests].

Thank you for taking the time to look. I would welcome any feedback on my game.

Sincerely,
[Player Name]
[Club or High School Team]
[Player Contact Information]`,
  },
  {
    key: 'thank-you-continued-interest', name: 'Thank You and Continued Interest', description: 'Thank a coach and keep the conversation going.',
    subject: 'Thank you, Coach [Coach Last Name] – [Player Name]',
    body: `Dear Coach [Coach Last Name],

Thank you for [Thank You Detail]. I appreciated your time, and it helped me understand more about [College Name] women's soccer.

[Why I Am Interested in Your Program]

I remain very interested in your program. I will keep you updated on my season, and my latest highlights are here if you would like to see them:
[Highlight Video Link]

Please let me know if there is anything I can send you.

Thank you again,
[Player Name]
[Graduation Year] [Position] | [Club or High School Team]
[Player Contact Information]`,
  },
];

export const defaultByKey = (key) => DEFAULT_TEMPLATES.find((t) => t.key === key) || null;
