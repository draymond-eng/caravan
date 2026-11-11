/* =============================================================================
   The Japan 2027 payload, lifted verbatim from the old standalone app's
   data.js. Kept byte-for-byte apart from the variable name so it is obvious
   this is a copy and not a rewrite: the curation is the whole point of moving
   it, and quietly "improving" it in transit would be the one way to lose it.

   Read once by /import/, then never again. Nothing in the app loads this.
   ========================================================================== */
/* =============================================================================
   TRIP DATA - the single source of truth for the whole app.

   This is the BASELINE / proposal (nothing is locked - the couples haven't
   met yet). Everything here is meant to be discussed, swapped, and voted on
   inside the app. Edit freely; the UI re-renders from this object.

   Dates: leave US Wed Apr 14, land Haneda Thu Apr 15, fly home Sun Apr 25.
   10 nights on the ground · Tokyo (4) → Hakone (1) → Kyoto (5). Group of 6.
   ========================================================================== */

const JAPAN_SEED = {
  meta: {
    title: "Japan 2027",
    tagline: "Six friends, ten nights in Japan",
    departUS: "2027-04-14",       // wheels up from the US (countdown target)
    landJapan: "2027-04-15",      // land Haneda, Thursday afternoon
    endDate: "2027-04-25",        // fly home Sunday
    nights: 10,
    homeTimezone: "America/Chicago", // most of the group flies from Chicago
    tripTimezone: "Asia/Tokyo",
    currency: { code: "JPY", symbol: "¥", perUSD: 164 }, // yen near weak end - in our favor
    goldenWeekWarning: "Golden Week starts Apr 29 - we're clear by 4 days. Hard wall: don't extend past the 25th.",
    estPerPerson: 4600,   // ~$3,190 ground + ~$1,400 economy flights
    estGroup: 27500,
    estNote: "Add 8–10% for 2027 pricing. Yen at 164/USD right now.",
    draft: true,          // baseline / open for discussion
    showPrices: false,    // ← we don't know real prices yet. Flip to true to surface $ estimates.
  },

  /* ---- The crew: 6 travelers, 3 couples ----------------------------------- */
  travelers: [
    { id: "dj",       name: "DJ Jamiel",          pair: "DJ & Laura",      couple: true, color: "#c8452f", photo: "assets/crew/dj.jpg",     from: "", dietary: "", phone: "", funFact: "" },
    { id: "laura",    name: "Laura Stefanow",      pair: "DJ & Laura",      couple: true, color: "#d98aa0", photo: "assets/crew/laura.jpg",  from: "", dietary: "", phone: "", funFact: "" },
    { id: "ali",      name: "Ali Washington",      pair: "The Washingtons", couple: true, color: "#2f6f9f", photo: "assets/crew/ali.jpg",    from: "", dietary: "", phone: "", funFact: "" },
    { id: "draymond", name: "Draymond Washington", pair: "The Washingtons", couple: true, color: "#1f9d8f", photo: "",                       from: "", dietary: "", phone: "", funFact: "" },
    { id: "curtis",   name: "Curtis Maafoh",       pair: "The Maafohs",     couple: true, color: "#7a5cc0", photo: "assets/crew/curtis.jpg", from: "", dietary: "", phone: "", funFact: "" },
    { id: "alexis",   name: "Alexis Maafoh",       pair: "The Maafohs",     couple: true, color: "#c98a3d", photo: "assets/crew/alexis.jpg", from: "", dietary: "", phone: "", funFact: "" },
  ],

  /* ---- Bases (the three places we sleep) ---------------------------------- */
  cities: [
    { id: "tokyo",  name: "Tokyo",  emoji: "🗼", nights: "Apr 15–19 · 4 nights", blurb: "Neon, shrines, and the best food city on earth.", lat: 35.6900, lng: 139.7040 },
    { id: "hakone", name: "Hakone", emoji: "♨️", nights: "Apr 19–20 · 1 night",  blurb: "Onsen in the mountains - the splurge night.",      lat: 35.2323, lng: 139.1069 },
    { id: "kyoto",  name: "Kyoto",  emoji: "⛩️", nights: "Apr 20–25 · 5 nights", blurb: "Old Japan - temples, torii, tea houses, geiko.",   lat: 35.0037, lng: 135.7760 },
  ],
  // Day trips out of a base (shown in the itinerary filter too)
  dayTrips: ["Kamakura", "Nara", "Osaka"],

  /* ---- Where we sleep: no presets - everyone submits up to 2 places per
     stop in-app, then the group votes. Neighborhood guides live below. ------ */
  stays: [
    { city: "tokyo",  label: "Tokyo",  nights: "Apr 15–19 · 4 nights", checkIn: "2027-04-15", checkOut: "2027-04-19" },
    { city: "hakone", label: "Hakone", nights: "Apr 19–20 · 1 night",  checkIn: "2027-04-19", checkOut: "2027-04-20" },
    { city: "kyoto",  label: "Kyoto",  nights: "Apr 20–25 · 5 nights", checkIn: "2027-04-20", checkOut: "2027-04-25" },
  ],

  /* ---- Flights / arrivals board ------------------------------------------- */
  flights: [
    { label: "Chicago group (4)", who: [], dir: "arrive", airport: "HND", date: "2027-04-15", time: "afternoon", flight: "", note: "4 travelers out of Chicago (ORD). Separate booking." },
    { label: "DC group (2)",      who: [], dir: "arrive", airport: "HND", date: "2027-04-15", time: "afternoon", flight: "", note: "2 travelers out of DC. Separate booking. Converge Thu afternoon." },
    { label: "Everyone home",     who: ["dj","laura","ali","draymond","curtis","alexis"], dir: "depart", airport: "HND", date: "2027-04-25", time: "", flight: "", note: "Fly home from Haneda (not Kansai - no nonstop from Osaka; going out through KIX = ~18h vs ~11.5h)." },
  ],
  flightsNote: "Round-trip Haneda for everyone. Who's in the Chicago 4 vs the DC 2? → assign in-app once bookings are set.",

  /* ---- Fares: routes to watch + a target to book at ----------------------- */
  fareDates: { depart: "2027-04-14", return: "2027-04-25" },
  fareTarget: 1400, // USD/person - book when it hits this
  fareRoutes: [
    { id: "ORD-HND", label: "Chicago → Tokyo", from: "ORD", to: "HND", who: "Chicago 4" },
    { id: "IAD-HND", label: "Washington → Tokyo", from: "IAD", to: "HND", who: "DC 2 (IAD has the Haneda nonstop)" },
  ],

  /* ---- Music: the collaborative Spotify playlist (embedded in the app) ----- */
  music: { spotifyUrl: "https://open.spotify.com/playlist/2WO6h42bjCGOKaJvHY9GZ1" },

  /* ---- Neighborhoods: what each area is known for + as a base ------------- */
  neighborhoods: [
    // TOKYO
    { city: "tokyo", name: "Shinjuku", emoji: "🌃", tags: ["Nightlife", "Transport hub", "Neon"],
      blurb: "The city at full volume - skyscrapers, the world's busiest station, and endless nightlife in Golden Gai and Omoide Yokocho.",
      base: "Our current base. Unbeatable for trains + late nights; can feel busy and hectic." },
    { city: "tokyo", name: "Shibuya", emoji: "🚦", tags: ["Youth", "Fashion", "Nightlife"],
      blurb: "Ground zero for youth culture - the Scramble Crossing, Shibuya Sky, and bars in every direction.",
      base: "Great energy and well-connected; pricey and crowded." },
    { city: "tokyo", name: "Harajuku & Omotesando", emoji: "🛍️", tags: ["Fashion", "Cafés", "People-watching"],
      blurb: "Takeshita Street's teen chaos on one end, tree-lined luxury (Omotesando) on the other.",
      base: "Central and stylish, and calmer at night." },
    { city: "tokyo", name: "Ginza", emoji: "💎", tags: ["Luxury", "Dining", "Shopping"],
      blurb: "Tokyo's upscale showcase - flagship stores, basement food halls, sushi counters, and Kabuki.",
      base: "Polished and central; more grown-up, quiet once shops close." },
    { city: "tokyo", name: "Asakusa", emoji: "⛩️", tags: ["Old Tokyo", "Temples", "Value"],
      blurb: "Old-school Tokyo around Senso-ji - rickshaws, craft shops, and traditional snacks.",
      base: "Atmospheric and cheaper; a bit removed from nightlife." },
    { city: "tokyo", name: "Marunouchi / Tokyo Station", emoji: "🚄", tags: ["Central", "Refined", "Bullet trains"],
      blurb: "Handsome district by the Imperial Palace and the Shinkansen gateway.",
      base: "Ultra-convenient for day trips + bullet trains; calm after dark." },
    { city: "tokyo", name: "Shimokitazawa", emoji: "🎸", tags: ["Indie", "Vintage", "Live music"],
      blurb: "Bohemian maze of vintage shops, tiny theaters, coffee, and zero chain-store energy.",
      base: "Cool and local; a short ride from the center." },
    { city: "tokyo", name: "Nakameguro", emoji: "🌸", tags: ["Chic", "Canal", "Cafés"],
      blurb: "A willow-lined canal packed with boutiques and coffee - one of Tokyo's prettiest strolls.",
      base: "Trendy and relaxed, residential feel." },
    { city: "tokyo", name: "Akihabara", emoji: "🎮", tags: ["Anime", "Electronics", "Arcades"],
      blurb: "Electric Town - anime, retro games, gachapon, and multi-floor arcades.",
      base: "A blast to visit; not somewhere to sleep." },
    { city: "tokyo", name: "Roppongi", emoji: "🍸", tags: ["Nightlife", "Art", "Late night"],
      blurb: "Late bars and clubs plus serious art - the Mori Museum and its skyline deck.",
      base: "Big nightlife + art; can feel touristy." },
    { city: "tokyo", name: "Yanaka", emoji: "🏮", tags: ["Old-town", "Quiet", "Artisan"],
      blurb: "A rare pre-war survivor - temple lanes, cats, craft shops, and a beloved shopping street.",
      base: "Sleepy and charming; light on nightlife." },

    // KYOTO
    { city: "kyoto", name: "Gion", emoji: "👘", tags: ["Geisha", "Traditional", "Atmospheric"],
      blurb: "Kyoto's iconic geisha district - lantern-lit lanes, tea houses, and maiko at dusk.",
      base: "Our base. The most atmospheric; book early, busier by day." },
    { city: "kyoto", name: "Higashiyama", emoji: "⛩️", tags: ["Temples", "Old streets"],
      blurb: "The postcard Kyoto - Kiyomizu-dera and the preserved slopes of Sannenzaka.",
      base: "Beautiful and walkable to sights; quiet at night." },
    { city: "kyoto", name: "Downtown (Kawaramachi / Pontocho)", emoji: "🍶", tags: ["Dining", "Nightlife", "Central"],
      blurb: "Kyoto's dining heart - Nishiki Market, the riverside Pontocho alley, shops and bars.",
      base: "Most convenient + lively; central to everything." },
    { city: "kyoto", name: "Arashiyama", emoji: "🎋", tags: ["Bamboo", "Riverside", "Scenic"],
      blurb: "Bamboo grove, riverside temples, and monkeys - Kyoto's scenic west, calmest early.",
      base: "Gorgeous but a bit removed; magical in the morning." },
    { city: "kyoto", name: "Kyoto Station", emoji: "🚄", tags: ["Transport", "Modern", "Convenient"],
      blurb: "The modern hub - bullet trains, buses, a striking station, and easy access everywhere.",
      base: "Most convenient for arrivals + day trips; less charming." },
    { city: "kyoto", name: "Fushimi", emoji: "🦊", tags: ["Torii gates", "Sake"],
      blurb: "Home of Fushimi Inari's endless torii and a historic sake-brewing district.",
      base: "South of center; great for the shrine + sake tasting." },

    // OSAKA
    { city: "osaka", name: "Namba & Dotonbori", emoji: "🍜", tags: ["Food", "Neon", "Nightlife"],
      blurb: "Osaka's roaring heart - takoyaki, okonomiyaki, the Glico sign, and nonstop energy.",
      base: "Where we'll spend the Osaka night." },
    { city: "osaka", name: "Shinsekai", emoji: "🍢", tags: ["Retro", "Kushikatsu"],
      blurb: "A gritty, nostalgic district under Tsutenkaku tower - kushikatsu central.",
      base: "Fun, old-school Osaka flavor." },
    { city: "osaka", name: "Umeda (Kita)", emoji: "🏙️", tags: ["Shopping", "Skyline", "Business"],
      blurb: "The northern hub - big stores, the Floating Garden sky deck, and slick dining.",
      base: "Polished and central to transport." },

    // HAKONE
    { city: "hakone", name: "Hakone-Yumoto", emoji: "♨️", tags: ["Gateway", "Onsen town"],
      blurb: "The hot-spring gateway town - shops, day onsen, and the start of the mountain loop.",
      base: "Where the Romancecar drops you." },
    { city: "hakone", name: "Gora & Sengokuhara", emoji: "🏔️", tags: ["Ryokan", "Art", "Fuji views"],
      blurb: "Higher-up onsen country - the Open-Air Museum, top ryokan, and Fuji on clear days.",
      base: "The scenic heart of a Hakone stay." },
    { city: "hakone", name: "Lake Ashi", emoji: "⛵", tags: ["Lake", "Shrine", "Fuji"],
      blurb: "Pirate-ship cruises, the Hakone Shrine's lake torii, and Fuji reflections.",
      base: "Postcard views; the loop's scenic finale." },
  ],

  /* ---- The day-by-day baseline. type: travel|sight|food|activity|rest|meet - */
  days: [
    {
      date: "2027-04-15", city: "tokyo", title: "Land in Tokyo - soak & yakitori",
      summary: "Land Haneda in the afternoon, drop bags at the hotel, yakitori in Omoide Yokocho, bed. Don't plan anything.",
      meetup: "Tokyo hotel lobby once everyone's landed (hotel TBD - vote in Stays)",
      items: [
        { time: "PM", type: "travel", title: "Land at Haneda (HND)", note: "Chicago 4 + DC 2 converge Thursday afternoon. Grab IC cards / pocket wifi at the airport.", lat: 35.5494, lng: 139.7798 },
        { time: "", type: "rest", title: "Settle in & unwind", note: "Drop bags, shower off the flight (or a soak, if our hotel has an onsen - a strong argument when voting in Stays).", lat: 35.6949, lng: 139.7076 },
        { time: "20:00", type: "food", title: "Yakitori in Omoide Yokocho", note: "'Memory Lane' - tiny smoky grilled-skewer alley by Shinjuku Station. Perfect low-effort first night.", lat: 35.6938, lng: 139.6996 },
      ],
    },
    {
      date: "2027-04-16", city: "tokyo", title: "Old Tokyo",
      summary: "Senso-ji at dawn (jet lag has you up anyway), Kappabashi knives, Yanaka in the afternoon, Golden Gai at night.",
      meetup: "Kaminarimon (Senso-ji gate) - early, beat the crowds",
      items: [
        { time: "07:00", type: "sight", title: "Senso-ji at dawn", note: "Tokyo's oldest temple, empty and magic before the tour buses. Jet lag is your friend today.", lat: 35.7148, lng: 139.7967 },
        { time: "10:00", type: "activity", title: "Kappabashi 'Kitchen Town'", note: "Street of knife and kitchenware shops. Buy a real Japanese knife - they'll engrave it.", lat: 35.7141, lng: 139.7876 },
        { time: "14:00", type: "activity", title: "Yanaka", note: "Old-Tokyo neighborhood that survived the war - Yanaka Ginza shopping street, cats, temples, slow pace.", lat: 35.7276, lng: 139.7660 },
        { time: "20:00", type: "food", title: "Golden Gai", note: "Six alleys of tiny themed bars in Shinjuku. Some have cover charges; wander and pick one.", lat: 35.6938, lng: 139.7047 },
      ],
    },
    {
      date: "2027-04-17", city: "tokyo", title: "The modern city",
      summary: "teamLab in the morning, Meiji Jingu, the Harajuku→Omotesando walk, Shibuya Sky at sunset.",
      meetup: "teamLab entrance (see the Decisions tab: Planets vs Borderless)",
      items: [
        { time: "09:30", type: "activity", title: "teamLab (Planets or Borderless)", note: "Immersive digital-art museum. BOOK TIMED TICKETS. Which location? → vote in Decisions. Planets = water rooms (wear rollable pants).", lat: 35.6497, lng: 139.7906 },
        { time: "12:30", type: "sight", title: "Meiji Jingu", note: "Forest shrine in the middle of the city - calm reset after the sensory overload.", lat: 35.6764, lng: 139.6993 },
        { time: "14:30", type: "activity", title: "Harajuku → Omotesando walk", note: "Takeshita Street chaos into the tree-lined 'Champs-Élysées of Tokyo.'", lat: 35.6657, lng: 139.7126 },
        { time: "17:30", type: "sight", title: "Shibuya Sky at sunset", note: "Open-air rooftop over the famous crossing. BOOK the sunset slot early - it sells out.", lat: 35.6580, lng: 139.7016 },
      ],
    },
    {
      date: "2027-04-18", city: "tokyo", title: "Kamakura - split the day",
      summary: "The surfer paddles out at Kugenuma; the other five do the Great Buddha + Hokoku-ji bamboo. Regroup for lunch, then the Enoden coastal line to Enoshima.",
      meetup: "Regroup for lunch in Kamakura ~12:30",
      items: [
        { time: "AM", type: "activity", title: "TRACK A: Surf at Kugenuma", note: "For the surfer in the group - mellow beach break west of Kamakura. Board rentals on the beach.", lat: 35.3130, lng: 139.4780 },
        { time: "AM", type: "sight", title: "TRACK B: Great Buddha + Hokoku-ji", note: "The five non-surfers: the giant bronze Kotoku-in Buddha, then the serene Hokoku-ji bamboo grove + matcha.", lat: 35.3167, lng: 139.5361 },
        { time: "12:30", type: "food", title: "Regroup for lunch", note: "Meet back in central Kamakura - shirasu (whitebait) is the local specialty.", lat: 35.3190, lng: 139.5503 },
        { time: "15:00", type: "travel", title: "Enoden line to Enoshima", note: "Tiny vintage tram that hugs the coast (Slam Dunk crossing!). Sunset island shrine + views back to Fuji.", lat: 35.2996, lng: 139.4802 },
      ],
    },
    {
      date: "2027-04-19", city: "hakone", title: "Tsukiji → ship bags → into the mountains",
      summary: "Tsukiji breakfast, ship the big bags ahead to Kyoto, take the Romancecar into Hakone, and stop moving.",
      meetup: "Tsukiji Outer Market main gate - 8:30am",
      items: [
        { time: "08:30", type: "food", title: "Tsukiji breakfast", note: "Tamagoyaki, uni, tuna, strawberries. Go hungry. Then check out of the Tokyo hotel.", lat: 35.6654, lng: 139.7707 },
        { time: "11:00", type: "travel", title: "Ship big bags → Kyoto (takkyubin)", note: "Send suitcases ahead to the Kyoto stay so you travel light through Hakone. ~¥2,000/bag, arrives next day.", lat: 35.6900, lng: 139.7040 },
        { time: "13:00", type: "travel", title: "Odakyu Romancecar to Hakone", note: "Reserved scenic train from Shinjuku into the mountains. Grab the front seats if you can.", lat: 35.2323, lng: 139.1069 },
        { time: "15:00", type: "rest", title: "Check into the ryokan & stop moving", note: "Ryokan TBD - vote in Stays. Ideally: onsen soak, kaiseki dinner, and absolutely nothing else. This is the day you do nothing.", lat: 35.2258, lng: 139.1044 },
      ],
    },
    {
      date: "2027-04-20", city: "kyoto", title: "Lake Ashi → Shinkansen → Kyoto",
      summary: "Lake Ashi in the morning if it's clear, then the bullet train to Kyoto and dinner in Pontocho.",
      meetup: "Hotel lobby after breakfast - check the weather for Fuji",
      items: [
        { time: "09:00", type: "sight", title: "Lake Ashi (if clear)", note: "Pirate-ship cruise with Mt. Fuji reflections on a clear day. If it's socked in, sleep in instead - no forcing it.", lat: 35.2039, lng: 139.0257 },
        { time: "13:00", type: "travel", title: "Shinkansen to Kyoto", note: "Back down to Odawara, then the bullet train west (~2h to Kyoto). Reserve 6 seats together. Get an ekiben.", lat: 34.9858, lng: 135.7588 },
        { time: "16:00", type: "rest", title: "Settle into the Kyoto stay", note: "Your shipped bags are waiting. Kyoto stay TBD - vote in Stays.", lat: 35.0037, lng: 135.7760 },
        { time: "19:30", type: "food", title: "Dinner in Pontocho", note: "Lantern-lit dining alley along the river. Book a spot with a kawayuka riverside deck if it's warm.", lat: 35.0043, lng: 135.7708 },
      ],
    },
    {
      date: "2027-04-21", city: "kyoto", title: "Fushimi Inari at dawn + Miyako Odori",
      summary: "Fushimi Inari at 6:30am (at ten it's a conveyor belt; at six-thirty it's yours), Kiyomizu-dera, the Higashiyama stone lanes, and the Miyako Odori in the afternoon.",
      meetup: "Hotel lobby - 6:00am (worth it, promise)",
      items: [
        { time: "06:30", type: "sight", title: "Fushimi Inari - empty", note: "Thousands of red torii up the mountain. At 6:30 you have it to yourself; by 10 it's a conveyor belt. Real shoes.", lat: 34.9671, lng: 135.7727 },
        { time: "10:00", type: "sight", title: "Kiyomizu-dera", note: "Hillside temple with the big wooden stage over the valley.", lat: 34.9949, lng: 135.7850 },
        { time: "11:30", type: "activity", title: "Higashiyama stone lanes", note: "Walk down Sannenzaka/Ninenzaka - matcha, crafts, kimono. Beautiful preserved slopes.", lat: 34.9976, lng: 135.7808 },
        { time: "15:00", type: "activity", title: "Miyako Odori", note: "The geiko and maiko of Gion in full-scale dance productions - every April since 1872. Only happens while we're here. BOOK TICKETS.", lat: 35.0031, lng: 135.7752 },
      ],
    },
    {
      date: "2027-04-22", city: "kyoto", title: "Arashiyama + craft workshop + cook at home",
      summary: "Arashiyama at 7am for the bamboo grove, Tenryu-ji, a craft workshop in the afternoon, and cooking together at the house that night.",
      meetup: "Hotel lobby - 6:30am for the empty bamboo grove",
      items: [
        { time: "07:00", type: "sight", title: "Arashiyama Bamboo Grove - empty", note: "Transcendent at 7am, a mob by 10. Same rule as Fushimi Inari: go early or don't bother.", lat: 35.0170, lng: 135.6716 },
        { time: "08:30", type: "sight", title: "Tenryu-ji", note: "Zen temple + borrowed-scenery garden right by the grove.", lat: 35.0159, lng: 135.6738 },
        { time: "14:00", type: "activity", title: "Craft workshop", note: "Hands-on afternoon - pottery, indigo dyeing, knife-making, or woodwork. → pick one in Decisions.", lat: 35.0116, lng: 135.7681 },
        { time: "19:00", type: "food", title: "Cook at the house", note: "A market run and a night in - the couples' night-in of the trip. (Argues for a Kyoto stay with a kitchen!)", lat: 35.0037, lng: 135.7760 },
      ],
    },
    {
      date: "2027-04-23", city: "kyoto", title: "Nara by day, Osaka by night",
      summary: "Todai-ji, the deer, Kasuga Taisha - then straight over to Osaka for Dotonbori at night, back to Kyoto around eleven.",
      meetup: "Kyoto Station, JR Nara Line - 8:30am",
      items: [
        { time: "09:15", type: "sight", title: "Todai-ji & the deer", note: "One of the world's largest wooden buildings + a giant bronze Buddha. Buy 'shika senbei' - the deer bow for them.", lat: 34.6889, lng: 135.8398 },
        { time: "11:30", type: "sight", title: "Kasuga Taisha", note: "Lantern-lined shrine in the forest - thousands of bronze and stone lanterns.", lat: 34.6811, lng: 135.8483 },
        { time: "18:00", type: "food", title: "Dotonbori, Osaka", note: "Takoyaki, okonomiyaki, kushikatsu, the Glico sign. The one big Osaka night. → see Decisions: is the late night worth it?", lat: 34.6687, lng: 135.5013 },
        { time: "23:00", type: "travel", title: "Back to Kyoto (~11pm)", note: "~15–30 min on the train. Late but worth it.", lat: 35.0037, lng: 135.7760 },
      ],
    },
    {
      date: "2027-04-24", city: "kyoto", title: "Slow last day + the big kaiseki",
      summary: "A slow last day with a private guide, Nijo Castle, the Philosopher's Path, then the one big kaiseki dinner - Kikunoi or Hyotei.",
      meetup: "Hotel lobby - relaxed morning start with the guide",
      items: [
        { time: "10:00", type: "sight", title: "Nijo Castle (private guide)", note: "Shogun's castle with 'nightingale floors' that chirp to foil intruders. A guide makes it sing.", lat: 35.0142, lng: 135.7481 },
        { time: "13:30", type: "activity", title: "Philosopher's Path", note: "Canal-side walk under the trees between temples - the slow, reflective last-day stroll.", lat: 35.0270, lng: 135.7947 },
        { time: "19:00", type: "food", title: "The big kaiseki dinner", note: "The one splurge meal - Kikunoi or Hyotei (300+ yrs old). → vote in Decisions. Book WEEKS ahead.", lat: 34.9987, lng: 135.7807 },
      ],
    },
    {
      date: "2027-04-25", city: "kyoto", title: "Home - 7:30 Nozomi to Haneda",
      summary: "The 7:30 Nozomi to Tokyo, then Haneda, then home. ⚠️ If the Haneda departure is before noon, the morning train doesn't work - we'd need a final Tokyo night.",
      meetup: "Kyoto Station - in time for the 7:30 Nozomi",
      items: [
        { time: "07:30", type: "travel", title: "Nozomi Kyoto → Tokyo", note: "~2h15 back to Tokyo, then transfer to Haneda. Confirm the flight time first (see Decisions).", lat: 34.9858, lng: 135.7588 },
        { time: "", type: "travel", title: "Haneda → home", note: "Round-trip out of Haneda. Be at the airport 3 hours early for international.", lat: 35.5494, lng: 139.7798 },
      ],
    },
  ],

  /* ---- DECISIONS: open questions the group votes on ----------------------- */
  /* status: open|leaning|decided. Votes are stored per-device (see note in UI). */
  decisions: [
    {
      id: "d-pace", title: "How hard do we go?", status: "open",
      note: "Sets the whole tone. There's no wrong answer - but we should all be on the same page before we book.",
      options: [
        { id: "full", label: "Dawn to midnight", note: "See everything, sleep when we're home." },
        { id: "balanced", label: "Balanced", note: "Big days, but real downtime built in." },
        { id: "slow", label: "Slow & spacious", note: "Fewer things, done well. Long dinners, long soaks." },
      ],
    },
    {
      id: "d-splurge", title: "If we splurge big on ONE thing, it's…", status: "open",
      note: "Everything else we keep reasonable. Where does the group want the 'wow' to land?",
      options: [
        { id: "ryokan", label: "The Hakone ryokan night", note: "Private open-air baths + kaiseki in the gorge." },
        { id: "kaiseki", label: "The big kaiseki dinner", note: "One unforgettable meal in Kyoto." },
        { id: "experience", label: "A standout experience", note: "Geisha dance, sumo, a private guide day." },
        { id: "even", label: "Spread it evenly", note: "No single blowout - comfortable across the board." },
      ],
    },
    {
      id: "d-hakone", title: "The Hakone onsen night - in or out?", status: "leaning",
      note: "A splurge ryokan night: private open-air baths, kimono on arrival, kaiseki dinner. The 'room IS the experience' night - which ryokan is up to the Stays vote.",
      options: [
        { id: "in", label: "In - trip centerpiece", note: "Worth it. Book it first." },
        { id: "simpler", label: "Keep Hakone, simpler ryokan", note: "Still an onsen night, lighter touch." },
        { id: "skip", label: "Skip it, extra Kyoto night", note: "Go straight Tokyo → Kyoto." },
      ],
    },
    {
      id: "d-meals", title: "How many nights do we all eat together?", status: "open",
      note: "Six people, three couples. Somewhere between 'every meal as a crew' and 'do your own thing' is the sweet spot.",
      options: [
        { id: "all", label: "Every night - we're a crew", note: "Book big tables everywhere." },
        { id: "most", label: "Most nights, some couple time", note: "A couple of nights off to roam solo." },
        { id: "few", label: "A few key dinners", note: "3–4 group meals, otherwise free." },
      ],
    },
    {
      id: "d-nightlife", title: "What's our night-out energy?", status: "open",
      note: "Golden Gai, karaoke, and late izakayas are right there - or not. Good to know before we plan evenings.",
      options: [
        { id: "big", label: "Let's go", note: "Golden Gai, karaoke, late-night ramen." },
        { id: "some", label: "A few fun nights", note: "Mostly early, a couple of blowouts." },
        { id: "chill", label: "Chill", note: "Dinner, a soak, and bed." },
      ],
    },
    {
      id: "d-kamakura", title: "Kamakura day: split up or stick together?", status: "open",
      note: "The plan has the surfer paddling out at Kugenuma while the other five do the Great Buddha + bamboo, then everyone regroups for lunch.",
      options: [
        { id: "split", label: "Split - surf vs temples", note: "Regroup for lunch + Enoshima." },
        { id: "together", label: "All together", note: "One plan, no one solo." },
        { id: "weather", label: "Decide day-of", note: "Let the surf/weather call it." },
      ],
    },
    {
      id: "d-teamlab", title: "teamLab: Planets or Borderless?", status: "open",
      note: "Both are jaw-dropping digital-art museums in Tokyo - we do one. BOOK timed tickets either way.",
      options: [
        { id: "planets", label: "Planets", note: "Barefoot through water + light rooms (Toyosu). Wear rollable pants." },
        { id: "borderless", label: "Borderless", note: "Wander-and-get-lost maze of rooms (Azabudai)." },
      ],
    },
    {
      id: "d-osaka", title: "Nara by day + Osaka by night - worth the ~11pm return?", status: "open",
      note: "Todai-ji and the deer, then over to Dotonbori for the street-food madness, back to Kyoto around eleven. Big day, big payoff.",
      options: [
        { id: "yes", label: "Yes - Dotonbori's a must", note: "Do the full day." },
        { id: "no", label: "Nara only, easy Kyoto night", note: "Skip the late Osaka run." },
      ],
    },
    {
      id: "d-kimono", title: "Kimono / yukata day in Kyoto?", status: "open",
      note: "Rent traditional dress for a day wandering the Higashiyama stone lanes. Unreal photos.",
      options: [
        { id: "all", label: "Yes - all six", note: "Full-group photo op." },
        { id: "optional", label: "Optional", note: "Whoever's into it." },
        { id: "skip", label: "Skip it", note: "Not our thing." },
      ],
    },
    {
      id: "d-craft", title: "Kyoto craft workshop - which one?", status: "open",
      note: "A hands-on afternoon before we cook together at the house. We pick one for the group.",
      options: [
        { id: "pottery", label: "Pottery", note: "Throw a bowl to take home." },
        { id: "indigo", label: "Indigo dyeing (aizome)", note: "Dye your own scarf/tenugui." },
        { id: "knife", label: "Knife making", note: "Finish + sharpen your own blade." },
        { id: "wood", label: "Woodwork", note: "Chopsticks / small joinery." },
      ],
    },
    {
      id: "d-kaiseki", title: "The big kaiseki dinner - where?", status: "open",
      note: "The one splurge meal. Both are legendary and 300+ years old - and both book out weeks ahead, so we decide early.",
      options: [
        { id: "kikunoi", label: "Kikunoi", note: "3 Michelin stars, Higashiyama." },
        { id: "hyotei", label: "Hyotei", note: "400+ years old, near Nanzenji." },
        { id: "either", label: "Whichever we can book", note: "First one with 6 seats wins." },
      ],
    },
    {
      id: "d-return", title: "Apr 25 return: what time's the Haneda flight?", status: "open",
      note: "The one real logistics unknown. If the flight's before noon, the 7:30 Nozomi from Kyoto doesn't work - we'd need a final Tokyo night on the 24th.",
      options: [
        { id: "afternoon", label: "Afternoon flight - plan holds", note: "Morning Nozomi works fine." },
        { id: "morning", label: "Morning flight - add a Tokyo night", note: "Move to Tokyo on the 24th." },
      ],
    },
  ],

  /* ---- IDEAS board: add-ons the group can thumbs-up ----------------------- */
  ideas: [
    { id: "i1", title: "Karaoke night (all 6)", city: "any",   note: "Non-negotiable at least once." },
    { id: "i2", title: "Sumo - morning practice or a match", city: "tokyo", note: "Depends on the tournament calendar." },
    { id: "i3", title: "Go-kart street tour (Mario-style)",  city: "tokyo", note: "Needs an International Driving Permit." },
    { id: "i4", title: "Tea ceremony in Kyoto", city: "kyoto", note: "Slow, beautiful, very Kyoto." },
    { id: "i5", title: "Yukata / kimono for a day in Higashiyama", city: "kyoto", note: "Great photos in the stone lanes." },
    { id: "i6", title: "Himeji Castle detour", city: "kyoto", note: "Japan's most stunning original castle - day trip." },
    { id: "i7", title: "Baseball game (NPB)", city: "any", note: "Japanese baseball crowds are unreal." },
    { id: "i8", title: "Nakameguro river walk", city: "tokyo", note: "Trendy canal-side cafes even post-blossom." },
  ],

  /* ---- Booking timeline. timing: now | soon | later ----------------------- */
  bookingOrder: [
    { id: "bk-pass",   label: "Passports valid 6+ months", note: "Everyone's passport must be valid well past the trip. If anyone needs a renewal, start now - it's the one thing you can't leave late.", timing: "now",   when: "Do this week" },
    { id: "bk-hakone", label: "Hakone ryokan", note: "Top ryokan have very limited rooms and book out first. Pick the winner in Stays, then grab all 3 rooms ASAP.", timing: "now", when: "Vote → book now" },
    { id: "bk-gion",   label: "Kyoto stay", note: "Places that sleep 6 together go fast. Vote in Stays, then lock it.", timing: "now", when: "Vote → book now" },
    { id: "bk-flights",label: "Flights - Haneda round-trip", note: "4 from Chicago, 2 from DC. April fares are open now; far easier to get 6 seats together early.", timing: "now", when: "Book now" },
    { id: "bk-tokyo",  label: "Tokyo hotel", note: "3 rooms, central + near trains. Vote in Stays, then book.", timing: "now", when: "Vote → book now" },
    { id: "bk-miyako", label: "Miyako Odori tickets", note: "Geiko/maiko dance - tickets go on sale in early spring. Watch for the release.", timing: "soon", when: "~Feb–Mar 2027" },
    { id: "bk-insurance", label: "Travel insurance", note: "Buy once flights are booked so the trip cost is covered.", timing: "soon", when: "After flights" },
    { id: "bk-shink",  label: "Shinkansen seats", note: "Open EXACTLY 30 days before each leg - can't book earlier. Reserve all 6 seats together the day they open.", timing: "later", when: "~Mar 2027 · 30 days out" },
    { id: "bk-timed",  label: "teamLab + Shibuya Sky", note: "Timed-entry and they sell out - book about a month ahead.", timing: "later", when: "~Mar 2027" },
    { id: "bk-kaiseki",label: "Kaiseki dinner (Kikunoi / Hyotei)", note: "Decide the venue now in Decisions; reserve about a month out.", timing: "later", when: "~Mar 2027" },
    { id: "bk-wifi",   label: "Pocket wifi / eSIM", note: "Sort a few weeks before - one pocket-wifi router can cover the whole group.", timing: "later", when: "A few weeks out" },
  ],

  /* ---- Packing list (late April = 55–72°F, dry, layers) ------------------- */
  packing: [
    { cat: "Documents", items: ["Passport (6+ mo validity)", "Flight confirmations", "Hotel confirmations", "Travel insurance", "Copy of passport", "IDP (if go-karting)"] },
    { cat: "Money & Phone", items: ["Some yen cash", "2+ credit cards (Visa/MC)", "eSIM or pocket wifi", "Charger + power bank", "US plugs fit (Japan is 100V Type A)"] },
    { cat: "Clothes (April layers)", items: ["Light jacket / packable shell", "A sweater or two", "Broken-in walking shoes", "Slip-on shoes (temples = shoes off)", "One nicer outfit (kaiseki dinner)", "Socks without holes"] },
    { cat: "For the ryokans", items: ["Swimsuit is NOT needed (onsen = bare)", "Small toiletry kit", "Hair tie (long hair up in the bath)", "Tattoo cover patches (if a stay has shared baths)"] },
    { cat: "Daypack", items: ["Foldable daypack", "Reusable water bottle", "Portable charger", "Hand towel (restrooms rarely have one)", "Small trash bag (bins are rare)", "Coin purse"] },
    { cat: "Health", items: ["Prescriptions (check Japan restrictions)", "Motion-sickness meds (boats/buses)", "Blister plasters", "Deodorant (bring your own)"] },
  ],

  /* ---- Phrasebook --------------------------------------------------------- */
  phrases: [
    { en: "Hello", jp: "こんにちは", romaji: "Konnichiwa" },
    { en: "Thank you", jp: "ありがとうございます", romaji: "Arigatō gozaimasu" },
    { en: "Excuse me / Sorry", jp: "すみません", romaji: "Sumimasen" },
    { en: "Please", jp: "お願いします", romaji: "Onegai shimasu" },
    { en: "Do you speak English?", jp: "英語を話せますか？", romaji: "Eigo o hanasemasu ka?" },
    { en: "How much is it?", jp: "いくらですか？", romaji: "Ikura desu ka?" },
    { en: "Where is the bathroom?", jp: "トイレはどこですか？", romaji: "Toire wa doko desu ka?" },
    { en: "Delicious!", jp: "おいしい！", romaji: "Oishii!" },
    { en: "Cheers!", jp: "乾杯！", romaji: "Kanpai!" },
    { en: "Check, please", jp: "お会計お願いします", romaji: "Okaikei onegai shimasu" },
    { en: "I have an allergy", jp: "アレルギーがあります", romaji: "Arerugī ga arimasu" },
    { en: "Table for six", jp: "六人です", romaji: "Roku-nin desu" },
    { en: "The station", jp: "駅", romaji: "Eki" },
    { en: "Water, please", jp: "お水をください", romaji: "Omizu o kudasai" },
  ],

  /* ---- Japan Guide cards (the FAQ, answered once) ------------------------- */
  guide: [
    { icon: "💳", title: "IC cards (Suica / Pasmo)", body: "Tap-to-ride cards for trains, buses, and konbini. Get a 'Welcome Suica' at Haneda or add Suica to Apple Wallet and top up with a card. One card works nationwide." },
    { icon: "🚄", title: "Shinkansen & the JR Pass math", body: "Skip the JR Pass this trip - our legs total ~$190/person and the pass is $305. Book Shinkansen seats exactly 30 days before each leg (they don't open earlier) and reserve all 6 seats together." },
    { icon: "📦", title: "Ship your bags (takkyubin)", body: "Send big suitcases ahead - hotel-to-hotel, ~¥2,000/bag, arrives next day. We do this Tokyo→Kyoto so we travel light through Hakone. Life-changing." },
    { icon: "📶", title: "Internet: eSIM vs pocket wifi", body: "eSIM (Airalo/Ubigi) is easiest per phone. A pocket wifi router is great for a group - one device covers everyone. Book airport or hotel pickup." },
    { icon: "💴", title: "Cash & cards", body: "More cashless than it used to be, but carry cash - small restaurants, shrines, and markets are cash-only. 7-Eleven ATMs reliably take foreign cards. Yen ~164/USD right now, in our favor." },
    { icon: "♨️", title: "Onsen rules", body: "Wash & rinse fully at the seated showers BEFORE the bath. No swimsuits - you go in bare. Small towel out of the water, hair up. If anyone has visible tattoos, check each stay's shared-bath policy - private/in-room baths sidestep it entirely." },
    { icon: "🙇", title: "Etiquette quick hits", body: "No tipping (it can offend). Quiet on trains, no calls. Shoes off at a genkan/step. Don't eat while walking. Carry your trash. Escalators: stand left in Tokyo." },
    { icon: "🏪", title: "Konbini are your friend", body: "7-Eleven, Lawson, FamilyMart: cheap great food, ATMs, tickets, umbrellas. Egg-salad sandos and fried chicken are elite. Open 24/7." },
    { icon: "🌸", title: "Late April weather", body: "Past peak bloom, which is the point: 55–72°F, dry, thinner crowds, ~half the hotel rates - plus wisteria and shibazakura season instead of cherry blossoms." },
    { icon: "🚨", title: "Emergency numbers", body: "Police: 110. Fire/Ambulance: 119. Very safe country. Save each hotel's address in Japanese to show taxi drivers. US Embassy Tokyo for anything serious." },
  ],
};

// Expose globally for the plain-script setup.
window.JAPAN_SEED = JAPAN_SEED;
