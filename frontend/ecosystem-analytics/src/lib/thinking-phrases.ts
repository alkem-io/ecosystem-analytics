const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Reflecting',
  'Considering',
  'Analyzing',
  'Examining',
  'Exploring',
  'Investigating',
  'Reasoning',
  'Processing',
  'Evaluating',
  'Assessing',
  'Contemplating',
  'Deliberating',
  'Mulling over',
  'Working through',
  'Piecing together',
  'Connecting the dots',
  'Researching',
  'Looking into it',
  'Digging deeper',
  'Sifting through data',
  'Scanning the ecosystem',
  'Searching the network',
  'Cross-referencing',
  'Mapping connections',
  'Tracing relationships',
  'Weighing the evidence',
  'Reviewing profiles',
  'Parsing the data',
  'Crunching numbers',
  'Gathering insights',
  'Synthesizing',
  'Formulating a response',
  'Putting it together',
  'Charting the landscape',
  'Surveying the terrain',
  'Running the analysis',
  'Consulting the graph',
  'Querying the index',
  'Matching patterns',
  'Drawing inferences',
  'Compiling results',
  'Filtering matches',
  'Sorting through connections',
  'Calibrating',
  'Deciphering',
  'Untangling',
  'Unraveling',
  'Distilling',
];

let lastIndex = -1;

export function getRandomThinkingPhrase(): string {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * THINKING_PHRASES.length);
  } while (idx === lastIndex && THINKING_PHRASES.length > 1);
  lastIndex = idx;
  return THINKING_PHRASES[idx];
}
