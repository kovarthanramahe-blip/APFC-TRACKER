import type { UpscCsePrelimsPyqBatchFile } from '../lib/upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims 2026, GS Paper I, Questions 1-50 — a pre-processed batch prepared externally
// (outside this app; see the 'source' field below) and supplied by the user for integration. Every
// question/option/hint field below is transcribed VERBATIM from that supplied batch — programmatically
// converted from the original JSON to this TypeScript literal to guarantee byte-for-byte fidelity
// (no manual retyping of 50 questions' worth of text). Never re-parsed from the original source
// text, never re-fetched, and never edited by hand — see lib/upscCsePrelimsPyqBatchImport.ts for
// what VALIDATEs and RESOLVEs this raw batch into data/pyqUpscCsePrelims.ts's actual destination
// records. correctOptionId is null throughout: the supplied batch carries no answer key.
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50: UpscCsePrelimsPyqBatchFile = {
  "schema": "upsc-cse-prelims-user-supplied-pyq-batch",
  "schemaVersion": 1,
  "exam": "UPSC CSE",
  "stage": "prelims",
  "paper": "GS Paper I",
  "year": 2026,
  "questionRange": "1-50",
  "source": {
    "kind": "user_provided_text",
    "filename": "Pasted markdown(5).md",
    "answerKeyProvided": false,
    "verificationStatus": "provisional"
  },
  "important": [
    "Question and option text was extracted from the supplied file without adding an answer key.",
    "correctOptionId is intentionally null because no answer key was supplied.",
    "microsyllabusHint values are classification hints and must be resolved against the app's stable microsyllabus IDs before persistence.",
    "No external source was used."
  ],
  "questions": [
    {
      "questionNumber": 1,
      "question": "Which one of the following Carnatic music ragas is similar to Raga Bilawal in Hindustani music?",
      "options": [
        {
          "id": "a",
          "text": "Nat Bhairavi"
        },
        {
          "id": "b",
          "text": "Kamavardhini"
        },
        {
          "id": "c",
          "text": "Hanumatodi"
        },
        {
          "id": "d",
          "text": "Dheera Shankarabharanam"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 2,
      "question": "The artificially fixed rupee-sterling exchange rate prescribed by the Hilton-Young Commission (1926) was adopted by the British Government for which one of the following reasons?",
      "options": [
        {
          "id": "a",
          "text": "Aiding the flow of remittances from India and maintaining India’s creditworthiness"
        },
        {
          "id": "b",
          "text": "Providing support to Indian importers"
        },
        {
          "id": "c",
          "text": "Encouraging export of cotton produce from India"
        },
        {
          "id": "d",
          "text": "Preventing depreciation of the Rupee in terms of gold"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 3,
      "question": "Consider the following statements: I. Pali texts contain the first definite references to coins, e.g., kahapana, nikkha, kamsa, and kakanika. II. The literary evidence from Pali texts is corroborated by archaeological evidence of punch-marked coins from many sites, most of them made of silver.\nThe above statements have been associated with which of the following?\n1. Emergence of urban life\n2. Transition to money economy",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 only"
        },
        {
          "id": "c",
          "text": "Both 1 and 2"
        },
        {
          "id": "d",
          "text": "Neither 1 nor 2"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 4,
      "question": "Which of the following temples has/have a Nagara-style shikhara?\n1. Malegitti Shivalaya, Badami\n2. Huchimalligudi Temple, Aihole\n3. Dashavatara Temple, Deogarh\n4. Virupaksha Temple, Pattadakal",
      "options": [
        {
          "id": "a",
          "text": "1 and 2"
        },
        {
          "id": "b",
          "text": "2 and 3"
        },
        {
          "id": "c",
          "text": "3 only"
        },
        {
          "id": "d",
          "text": "3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 5,
      "question": "Among the four main forms of existence of life recognized in Jainism, which one of the following is not included?",
      "options": [
        {
          "id": "a",
          "text": "Deva (gods)"
        },
        {
          "id": "b",
          "text": "Yaksha (demi-gods)"
        },
        {
          "id": "c",
          "text": "Manushya (humans)"
        },
        {
          "id": "d",
          "text": "Tiryancha (animals and plants)"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 6,
      "question": "The Hallisalasya painting in the Bagh Caves represents:",
      "options": [
        {
          "id": "a",
          "text": "A joyous folk dance"
        },
        {
          "id": "b",
          "text": "Buddha in a meditative pose"
        },
        {
          "id": "c",
          "text": "The depiction of Shiva and Parvati on Kailasha"
        },
        {
          "id": "d",
          "text": "Samudramanthan (Churning of the Ocean)"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 7,
      "question": "Consider the following statements relating to the use of the place-value system in India:\n1. The earliest epigraphic use of the place-value system in India is found in the Mankani plates from Gujarat (AD 595-596).\n2. In the ninth century, place-values become general in inscriptions all over India.\n3. The place-values have been found in Sanskrit inscriptions in South-east Asia as early as the seventh century.\nWhich of the statements given above are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "1 and 3 only"
        },
        {
          "id": "c",
          "text": "2 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 8,
      "question": "Consider the following statements about the archaeological findings in Harappan towns: I. There is wide occurrence of spindle-whorls in the houses but absence of spinning wheels. II. Weights and measurement scales, complete with graduations have been discovered. III. There are houses built in large part with baked bricks, around relatively spacious courtyards, with their own wells, bathing platforms, and large rooms.\nWhich of the following inferences can be drawn from the above statements?\n1. Statement I suggests that spinning was a laborious activity done at home.\n2. Statement II suggests the extent of the scientific knowledge that the Harappans possessed.\n3. Statement III suggests the emergence of a common property system.",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 9,
      "question": "Which one of the following statements about the Eka Movement and Bardoli Satyagraha is correct?",
      "options": [
        {
          "id": "a",
          "text": "The Eka Movement was throughout supported and organized by the Congress while Bardoli Satyagraha was initially independent of Congress influence and was only in the last stages supported by the Congress."
        },
        {
          "id": "b",
          "text": "The Eka Movement was provided leadership by the taluqdars of Awadh, whereas the Bardoli Satyagraha was a movement of the landless labourers."
        },
        {
          "id": "c",
          "text": "The Bardoli Satyagraha was a campaign against the enhancement of land revenue, while the Eka Movement was a protest against excessive extraction of rents."
        },
        {
          "id": "d",
          "text": "The Eka Movement was located in the Varanasi and Mirzapur districts of the present-day U.P., while the Bardoli Satyagraha took place in Saurashtra."
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Freedom Struggle",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 10,
      "question": "Consider the following statements about the Rigvedic period : I. Irrigation from wells allowed agriculture to expand away from flood plains and strips on river margins into the present Punjab and Haryana plains having underground water levels reasonably close to the surface. II. Draught-animal power was employed to draw up water out of the wells.\nWhich of the following information support/supports the above statements?\n1. There is evidence in the Rigveda of the use of ashma chakra (stone pulley wheel) and ahava (strapped wooden pails) to draw up water.\n2. Mention has been made in the Rigveda of the use of implements like parashu/kulisha (axe) and datra /sreni (sickle).\n3. There is a history of the use of ox, even before the Rigveda, for ploughing the land and pulling the carts.",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "1, 2 and 3"
        },
        {
          "id": "c",
          "text": "1 and 3 only"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 11,
      "question": "Consider the following assertion: In the Pleistocene period either the Yamuna once flowed into the Indus, or the Sutlej flowed into the Yamuna and one major tributary of either had shifted from the Ganga to the Indus or vice versa.\nWhich of the following is/are the basis of the above assertion?\n1. The Nadi-Sukta of the Rigveda\n2. The explorations of the Sutlej and the Yamuna by Robert Bruce Foote\n3. The presence of the same species of dolphins in both the Indus and the Ganga river systems",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 only"
        },
        {
          "id": "c",
          "text": "1 and 2"
        },
        {
          "id": "d",
          "text": "3"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Indian Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 12,
      "question": "What does an empty seat represent in early Buddhist iconography?",
      "options": [
        {
          "id": "a",
          "text": "The meditation of the Buddha"
        },
        {
          "id": "b",
          "text": "The Buddha’s First Sermon"
        },
        {
          "id": "c",
          "text": "The Buddha’s Mahaparinibbana"
        },
        {
          "id": "d",
          "text": "The Buddha’s Mahabhinishkramana"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 13,
      "question": "Which of the following pairs of ancient and modern names of rivers is/are correctly matched?\n1. Vitasta : Chenab\n2. Asikni : Jhelum\n3. Parushni : Ravi\n4. Yavyavati : Beas",
      "options": [
        {
          "id": "a",
          "text": "1 and 2"
        },
        {
          "id": "b",
          "text": "3 and 4"
        },
        {
          "id": "c",
          "text": "3 only"
        },
        {
          "id": "d",
          "text": "4 only"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 14,
      "question": "Which of the following statements on the Amaravati Stupa and its relief sculpture is/are correct?\n1. It was located in the lower Krishna valley.\n2. In India, it was next only to the Sanchi Stupa in size.\n3. The Amaravati school of sculpture made a lasting impact on the later South Indian sculpture, and its products were carried to Sri Lanka and South-east Asia.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 3 only"
        },
        {
          "id": "c",
          "text": "2 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 15,
      "question": "Which of the following pairs of the king and his dynasty in early historical Tamilakam is/are not correctly matched ?\n1. Senguttuvan : Chera\n2. Udiyanjeral : Chola\n3. Nedunjeliyan : Pandya",
      "options": [
        {
          "id": "a",
          "text": "1 and 2"
        },
        {
          "id": "b",
          "text": "2 only"
        },
        {
          "id": "c",
          "text": "1 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 16,
      "question": "Which of the following factors contributed to the formation of the Forward Bloc by Subhas Chandra Bose in 1939?\n1. Bose failed to win the confidence of Mahatma Gandhi.\n2. The Congress Left was disunited and failed to support Bose.\n3. The Communists did not support Bose in his endeavours.\n4. The supporters of M.N. Roy and socialist leaders like Jayaprakash Narayan preferred Congress unity to supporting Bose.",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
        },
        {
          "id": "b",
          "text": "1, 2 and 4"
        },
        {
          "id": "c",
          "text": "1, 3 and 4"
        },
        {
          "id": "d",
          "text": "2 and 4 only"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Freedom Struggle",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 17,
      "question": "Consider the following statements regarding the British policy in Awadh immediately after its annexation in 1856:\n1. The taluqdars were dispossessed of their estates but allowed to retain their arms and forts.\n2. A Summary Revenue Settlement was made in 1856 assuming that the taluqdars were outsiders.\n3. The British believed in taking revenue directly from the peasants by removing the taluqdars.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "2 and 3 only"
        },
        {
          "id": "b",
          "text": "1 and 3 only"
        },
        {
          "id": "c",
          "text": "1, 2 and 3"
        },
        {
          "id": "d",
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 18,
      "question": "Consider the following assertion : The genesis of political alliances based on community lay in the very nature of the Montagu-Chelmsford Reforms, 1919.\nWhich of the following statements support/supports the above assertion?\n1. Reforms retained and extended the principle of separate electorates.\n2. Separate electorates were supposed to counter Indian nationalism, which was growing stronger.\n3. Deprived classes rallied around the favours inherent in separate electorates.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 19,
      "question": "Pandit Mallikarjun Mansur, the famous classical singer from Karnataka, represented the:",
      "options": [
        {
          "id": "a",
          "text": "Agra Gharana"
        },
        {
          "id": "b",
          "text": "Gwalior Gharana"
        },
        {
          "id": "c",
          "text": "Patiala Gharana"
        },
        {
          "id": "d",
          "text": "Jaipur-Atrauli Gharana"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 20,
      "question": "In which one among the following texts does the term kshetra-patni (‘mistress of the field’) originate?",
      "options": [
        {
          "id": "a",
          "text": "Rigveda"
        },
        {
          "id": "b",
          "text": "Atharvaveda"
        },
        {
          "id": "c",
          "text": "Ashtadhyayi"
        },
        {
          "id": "d",
          "text": "Arthashastra"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 21,
      "question": "Consider the following statements with reference to India’s response to climate change: I. India’s Long-Term Low Emission Development Strategy (LT-LEDS) is a crucial tool for achieving net-zero emissions by 2070. II. India’s 4th Biennial Update Report (BUR-4) submitted in December, 2024 recorded around 8% decrease in Greenhouse gas emissions in 2020 over 2019. III. Climate-resilient development necessarily depends on quick and short-term achievement of emission reduction targets.\nWhich of the following relationships among the above statements is/are correct?\n1. Statement I is empirically supported by statement II.\n2. Statement III contradicts the approach implicit in statement I.\n3. Statement I and statement III together establish the premise of long-term sustainability.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Climate Change",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 22,
      "question": "With respect to the Western Hoolock Gibbons, which of the following statements is/are correct?\n1. A Sanctuary in North-east India is home to this ape species listed as Endangered in the International Union for Conservation of Nature (IUCN) Red List.\n2. They have specialized brachiation and can easily swing between trees.\n3. They possess a strong and heavy build like gorillas, yet are remarkably agile tree climbers.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 23,
      "question": "Which of the following best explain(s) the rationale for protecting mangrove ecosystems in the context of climate resilience?\n1. Mangroves reduce tidal energy and store freshwater, making them ideal sites for paddy cultivation in saline estuarine belts.\n2. Their salt-sensitive roots filter seawater, making mangroves key to converting coastal land into freshwater aquaculture zones.\n3. By withstanding tidal surges and offering biomass resources, mangroves function both as natural bio-shields and livelihood bases for rural communities.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Climate Change",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 24,
      "question": "In what way(s) does the Vizhinjam International Seaport represent a structural shift in India’s maritime trade and logistics policy?\n1. By functioning exclusively as a domestic cargo hub to reduce reliance on coastal shipping and eliminate the need for foreign collaborations.\n2. By focusing primarily on passenger cruise tourism and heritage shipping to increase Kerala’s profile as a maritime heritage destination.\n3. By leveraging its natural deep draft and strategic location to reduce dependence on foreign trans-shipment ports, enhance revenue retention, and reposition India in regional maritime trade.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Indian Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 25,
      "question": "Identify the river of the Indian sub-continent on the basis of the following information:\n1. It has an antecedent drainage system.\n2. It flows through three countries.\n3. It originates in the Tibetan Plateau and is an important river for irrigation.\n4. It does not form distributaries.",
      "options": [
        {
          "id": "a",
          "text": "Brahmaputra"
        },
        {
          "id": "b",
          "text": "Indus"
        },
        {
          "id": "c",
          "text": "Sutlej"
        },
        {
          "id": "d",
          "text": "Teesta"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Indian Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 26,
      "question": "Which of the following with reference to Indian States is/are not correct?\n1. Uttar Pradesh shares its boundary with the highest number of other Indian States.\n2. Rajasthan shares the longest international border among all Indian States.\n3. Sikkim is the only State that shares its boundary with just one other Indian State.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Indian Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 27,
      "question": "Which of the following statements with regard to the arrival of Amur Falcons at Doyang Lake in Nagaland each year from Mongolia is/are correct?\n1. It showcases how sustained local conservation efforts can contribute to the arrival and protection of international migratory birds.\n2. It reflects the global success of advanced tracking technologies that guide migratory birds back to their stopover sites.\n3. It confirms that Amur Falcons have adapted to permanent residency in India due to favourable habitat changes.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 28,
      "question": "Which among the following is/are the objective(s) of the Rainfed Area Development (RAD) initiative under the National Mission for Sustainable Agriculture (NMSA)?\n1. Encouraging monoculture in rainfed areas\n2. Increasing rice cultivation in irrigated regions\n3. Enhancing productivity and minimising climatic risks through Integrated Farming Systems (IFS)",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Agriculture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 29,
      "question": "Which of the following is/are the most significant implication(s) of obtaining Oeko-Tex certification for Eri Silk in the global textile industry?\n1. It allows Indian exporters to compete in high-end markets that prioritise chemical-free products.\n2. It confirms that Eri Silk meets international safety, environmental, and quality standards, enabling its entry into premium eco-conscious markets.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 only"
        },
        {
          "id": "c",
          "text": "Both 1 and 2"
        },
        {
          "id": "d",
          "text": "Neither 1 nor 2"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Economic Development",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 30,
      "question": "Ships from which of the following countries have to cross the Strait of Hormuz to reach out to the Indian Ocean?\n1. Bahrain\n2. Syria\n3. Qatar\n4. Egypt",
      "options": [
        {
          "id": "a",
          "text": "1 and 2"
        },
        {
          "id": "b",
          "text": "1 and 3"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "World Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 31,
      "question": "Tungurahua Volcano, which was declared a Global Geopark by UNESCO in 2025, is situated in which one among the following countries?",
      "options": [
        {
          "id": "a",
          "text": "Ecuador"
        },
        {
          "id": "b",
          "text": "Peru"
        },
        {
          "id": "c",
          "text": "Bolivia"
        },
        {
          "id": "d",
          "text": "Colombia"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 32,
      "question": "With reference to Madhav National Park, which of the following statements is/are correct?\n1. It was declared a Tiger Reserve in India in 2025.\n2. Sakhya Sagar, which is designated as a Ramsar Site, is situated within this National Park.\n3. Its area is shared between Madhya Pradesh and Rajasthan.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 3"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 33,
      "question": "With reference to the climate of Andaman and Nicobar Islands, which of the following statements is/are correct?\n1. The climate can be defined as a humid, tropical coastal climate.\n2. It receives rainfall from both South-west monsoon and North-east monsoon.\n3. Maximum precipitation is between December and May.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Indian Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 34,
      "question": "Which of the following geographical features or phenomena is/are associated with the Peninsular Block of India?\n1. Submergence of parts of the western coast due to tectonic activity\n2. Presence of residual mountain ranges such as the Veliconda hills and Mahendragiri hills\n3. Deep, V-shaped river valleys formed by fast-flowing rivers",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 35,
      "question": "Consider the following statements with reference to the Sagarmala Programme of the Government of India :\nI. The Sagarmala Programme seeks to achieve port-led economic growth through cost-effective and sustainable coastal infrastructure. II. The success of the Sagarmala Programme is reflected in significant growth in coastal and inland waterway shipping, along with improved global port rankings. III. Sagarmala 2.0 aims to position India as a global maritime innovation hub aligned with Atmanirbhar Bharat and Viksit Bharat 2047 visions.\nWhich of the following relationships among the above statements is/are correct?\n1. Statement II validates the effectiveness of the strategies envisioned in statement I.\n2. Statement III extends the objectives of statement I by embedding them into a future-oriented innovation framework.\n3. Statement I contradicts statement III by focusing only on traditional infrastructure instead of modern innovation.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Infrastructure",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 36,
      "question": "Consider the following statements about Rhynchostylis retusa (Foxtail orchid):\n1. It is an epiphytic orchid.\n2. The species is endemic to North-east India.\n3. It is the State flower of Arunachal Pradesh and Assam.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 3"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 37,
      "question": "Which one of the following statements with regard to the Moidams, built by the Tai-Ahom kingdom and inscribed as a World Heritage Site by UNESCO, is/are correct?\n1. They acted as army fortresses.\n2. They were recreation centres of the Royals and Nobles.\n3. They were burial grounds of the Royals and Nobles.\n4. They were battle drill centres of the Royals and Nobles.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 3"
        },
        {
          "id": "c",
          "text": "3 only"
        },
        {
          "id": "d",
          "text": "2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Art & Culture",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 38,
      "question": "At the United Nations Ocean Conference (UNOC) held in June, 2025 in France, the Food and Agricultural Organization (FAO) of the United Nations demonstrated its leading voice on marine and ocean issues, especially on sustainable fisheries and aquaculture for resilient “Blue Transformation”.\nWhich of the following combinations about the “Four Betters” proposed by FAO for “Blue Transformation” is correct?",
      "options": [
        {
          "id": "a",
          "text": "Better production, better nutrition, better environment and better ocean"
        },
        {
          "id": "b",
          "text": "Better production, better nutrition, better environment and better life"
        },
        {
          "id": "c",
          "text": "Better coral reefs, better nutrition, better environment and better life"
        },
        {
          "id": "d",
          "text": "Better estuaries, better nutrition, better environment and better mangrove vegetation"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Marine & Coastal Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 39,
      "question": "Which of the following statements with reference to Lake Turkana is/are correct?\n1. It is the largest desert lake in the world.\n2. The lake is situated in South Sudan along the eastern fringe of the Sahara desert.\n3. The lake is listed as a UNESCO World Heritage Site and is also referred to as the ‘Jade Sea’.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 3 only"
        },
        {
          "id": "c",
          "text": "2 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "World Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 40,
      "question": "Which one of the following is the first Plan Vivo certified Reducing Emissions from Deforestation and Forest Degradation (REDD+) project in India?",
      "options": [
        {
          "id": "a",
          "text": "Uttarakhand REDD+ project"
        },
        {
          "id": "b",
          "text": "ICFRE-ICIMOD Transboundary REDD+ project in North-Eastern Himalayas"
        },
        {
          "id": "c",
          "text": "Khasi Hills Community REDD+ project"
        },
        {
          "id": "d",
          "text": "Sikkim Mamley Kamrang Community REDD+ project"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Climate Change",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 41,
      "question": "Which of the following statements with regard to genetic medicine is/are correct?\n1. Genetic medicines correct/compensate for the faulty genes responsible for disease.\n2. Engineered viruses and lipid nanoparticles are used as carriers of the genetic medicine.\n3. Genetic medicines alter the entire DNA sequence.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Biotechnology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 42,
      "question": "Which of the following statements with regard to Large Language Models (LLMs) used in machine learning is/are correct?\n1. LLMs assign probabilities to the next possible words and then pick the one with the highest probability.\n2. LLMs process data through mathematical optimization to minimise prediction errors.\n3. LLMs produce unbiased outputs.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "1 and 2 only"
        },
        {
          "id": "c",
          "text": "2 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Artificial Intelligence",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 43,
      "question": "Which of the following statements with regard to stealth technology is/are correct?\n1. Stealth objects have a very small radar cross-section and are coated with Radar Absorbing Material.\n2. Stealth objects can be detected using specific frequencies.\n3. Stealth objects are coated with metamaterials to increase the scattering of electromagnetic radiation.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Defence Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 44,
      "question": "Which of the following statements with regard to Black Boxes used in modern aircrafts is/are correct?\n1. They carry a beacon emitting red light pulses to facilitate underwater detection.\n2. They record both the cockpit voice and flight data.\n3. Their memory units are made using either stainless steel or titanium.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Aviation Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 45,
      "question": "Which of the following statements with regard to Green Hydrogen is/are correct?\n1. It is decarbonized hydrogen obtained from natural gas reforming combined with carbon capture and storage (CCS).\n2. It is produced using electrolysis of water with electricity generated by renewable energy.\n3. National Green Hydrogen Mission of India aims for abatement of nearly 50 MMT of annual greenhouse gas emissions by 2030.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Energy Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 46,
      "question": "Consider the following statements with regard to involvement of private entities in India’s space programme:\n1. The Indian National Space Promotion and Authorisation Centre (IN-SPACE) is an autonomous agency formed to facilitate participation of private entities.\n2. Agnikul Cosmos launched the world’s first flight using 3D-printed rocket engine.\n3. Skyroot Aerospace has developed liquid fuel for GSLV.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Space Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 47,
      "question": "Which of the following statements with regard to drone swarms is/are correct?\n1. They use Terahertz band of frequency to communicate with the command centre.\n2. Individual drones in the swarm can communicate with other drones in the swarm.\n3. GPS Spoofing is a commonly used technique to counter drone swarm attack.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Defence Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 48,
      "question": "Which of the following statements with regard to GenomeIndia Project is/are correct?\n1. It is a part of the Human Genome Project.\n2. The project is funded by the Department of Biotechnology (DBT), Government of India.\n3. Its primary aim is to build a catalogue of genetic diversity of the Indian population.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Biotechnology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 49,
      "question": "Which of the following statements with regard to the National Quantum Mission (NQM) is/are correct?\n1. It aims at developing intermediate-scale quantum computers with 50-1000 physical qubits.\n2. Its implementation includes setting up of four Thematic Hubs (T-Hubs) in academic and national R&D institutes across India.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 only"
        },
        {
          "id": "c",
          "text": "Both 1 and 2"
        },
        {
          "id": "d",
          "text": "Neither 1 nor 2"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Quantum Technology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 50,
      "question": "Which of the following statements with regard to India’s Deep Ocean Mission is/are correct?\n1. It was launched by the Ministry of Ports, Shipping and Waterways, Government of India.\n2. Matsya-6000 has been designed to carry 3 people for deep sea exploration.\n3. Samudrayaan is a project under this mission.",
      "options": [
        {
          "id": "a",
          "text": "1 only"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Ocean Technology",
      "mappingStatus": "review_required"
    }
  ]
};
