import type { UpscCsePrelimsPyqBatchFile } from '../lib/upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims 2024, GS Paper I, Questions 1-100 — a pre-processed batch built from the exact
// question-paper text the user pasted directly into this Claude Code session (see the 'source'
// field below; no file was uploaded, so no sourceFilename is recorded — a separate answer-key
// screenshot was shared but covers only Q1-15 of 100, see 'important' below). Every question/option
// field below is transcribed VERBATIM from that pasted text — this file itself was generated
// programmatically from the pasted text to guarantee byte-for-byte fidelity (no manual retyping of
// 100 questions' worth of text). Never re-parsed from a different source, never re-fetched, and
// never edited by hand — see lib/upscCsePrelimsPyqBatchImport.ts for what VALIDATEs and RESOLVEs
// this raw batch into data/pyqUpscCsePrelims.ts's actual destination records. correctOptionId is
// null throughout — see 'important' below for why no answer key is attached in this pass. subject/
// microsyllabusHint are populated against the EXISTING UPSC_CSE_PRELIMS_SYLLABUS taxonomy only (see
// 'important' below for the 11 finance/market-structure questions left at subject-level only).
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100: UpscCsePrelimsPyqBatchFile = {
  "schema": "upsc-cse-prelims-user-supplied-pyq-batch",
  "schemaVersion": 1,
  "exam": "UPSC CSE",
  "stage": "prelims",
  "paper": "GS Paper I",
  "year": 2024,
  "questionRange": "1-100",
  "source": {
    "kind": "user_provided_text",
    "answerKeyProvided": false,
    "verificationStatus": "provisional"
  },
  "important": [
    "Question and option text was transcribed verbatim from the text the user pasted directly into this Claude Code session (the official UPSC CSE Prelims 2024 GS Paper I question paper) — this file itself was generated programmatically from that pasted text to guarantee byte-for-byte fidelity, never retyped by hand.",
    "correctOptionId is intentionally null throughout: the user separately supplied a screenshot of the answer key covering only Q1–15 of 100 (page 1 of 4 of a 4-page key) — attaching a 15%-complete answer key would leave the batch inconsistently keyed, so none of it is attached in this pass. See data/pyqUpscCsePrelims.ts for how the 2025/2026 batches attach their own full answer keys as a separate, later step — the same two-step process should be followed here once/if the full 2024 key becomes available.",
    "subject/microsyllabusHint are populated per-question against the EXISTING UPSC_CSE_PRELIMS_SYLLABUS taxonomy only — no new subject or microsyllabus item was invented. 11 questions (Q31, 32, 33, 82, 83, 84, 85, 87, 89, 90, 100) are pure finance/market-structure content (e.g. US treasury debt, syndicated lending, digital rupee, NBFC/G-Secs regulation, physical capital categories, CBLOs) that has no genuinely defensible match among Economic & Social Development's existing 4 microsyllabus items (Sustainable Development, Poverty & Inclusion, Demographics, Social Sector Initiatives); for these, subject is preserved as 'Economic & Social Development' (the nearest defensible existing subject) while microsyllabusHint is left null, so they resolve to needs_review via the existing mechanism rather than being forced into a misleading microsyllabus match.",
    "The official answer key screenshot (Q1–15 only) also states 3 of the 100 questions were dropped from scoring by UPSC and only 97 were scored — informational only; all 100 questions are still imported here exactly as numbered in the official paper, since a dropped-from-scoring question is still a real, correctly-numbered part of the paper."
  ],
  "questions": [
    {
      "questionNumber": 1,
      "question": "How many delimitation Commissions have been constituted by the Government of India till December 2023?",
      "options": [
        {
          "id": "a",
          "text": "One"
        },
        {
          "id": "b",
          "text": "Two"
        },
        {
          "id": "c",
          "text": "Three"
        },
        {
          "id": "d",
          "text": "Four"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 2,
      "question": "The Constitution (71st Amendment) Act, 1992 amends the Eighth Schedule to the Constitution to include which of the following languages?\n1. Konkani\n2. Manipuri\n3. Nepali\n4. Maithili\nSelect the correct answer using the code given below:",
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
          "text": "2, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 3,
      "question": "Consider the following pairs:\nParty\tIts Leader\nBharatiya Jana Sangh\tDr. Shyama Prasad Mukherjee\nSocialist Party\tC. Rajagopalachari\nCongress for Democracy\tJagjivan Ram\nSwatantra Party\tAcharya Narendra Dev\nHow many of the above are correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 4,
      "question": "Which of the following statements are correct about the constitution of India?\n1. Powers of the Municipalities are given in Part IX A of the Constitution.\n2. Emergency provisions are given in Part XVIII of the Constitution.\n3. Provisions related to the amendment of the constitution are given in Part XX of the Constitution.\nSelect the answer using the code given below:",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 5,
      "question": "Which one of the following statements is correct as per the Constitution of India?",
      "options": [
        {
          "id": "a",
          "text": "Inter-State trade and commerce is a State subject under the State List."
        },
        {
          "id": "b",
          "text": "Inter-State migration is a State subject under the State List."
        },
        {
          "id": "c",
          "text": "Inter-State quarantine is a Union subject under the Union List."
        },
        {
          "id": "d",
          "text": "Corporation tax is a State subject under the State List."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 6,
      "question": "Under which of the following Articles of the Constitution of India, has the Supreme Court of India placed the Right to Privacy?",
      "options": [
        {
          "id": "a",
          "text": "Article 15"
        },
        {
          "id": "b",
          "text": "Article 16"
        },
        {
          "id": "c",
          "text": "Article 19"
        },
        {
          "id": "d",
          "text": "Article 21"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Rights Issues",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 7,
      "question": "What are the duties of the Chief of Defence Staff (CDS) as Head of the Department of Military Affairs?\n1. Permanent Chairman of Chiefs of Staff Committee\n2. Exercise military command over the three Service Chiefs\n3. Principal Military Advisor to Defence Minister on all tri-service matters\nSelect the correct answer using the code given below:",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
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
          "text": "1 and 3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 8,
      "question": "Operations undertaken by the Army towards upliftment of the local population in remote areas to include addressing of their basic needs is called:",
      "options": [
        {
          "id": "a",
          "text": "Operations Sankalp"
        },
        {
          "id": "b",
          "text": "Operation Maitri"
        },
        {
          "id": "c",
          "text": "Operation Sadbhavana"
        },
        {
          "id": "d",
          "text": "Operation Madad"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 9,
      "question": "The longest border between any two countries in the world is between:",
      "options": [
        {
          "id": "a",
          "text": "Canada and the United States of America"
        },
        {
          "id": "b",
          "text": "Chile and Argentina"
        },
        {
          "id": "c",
          "text": "China and India"
        },
        {
          "id": "d",
          "text": "Kazakhstan and Russian Federation"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 10,
      "question": "Which of the following statements about the Ethics Committee in the Lok Sabha are correct?\n1. Initially it was an ad-hoc Committee.\n2. Only a Member of the Lok Sabha can make a complaint relating to unethical conduct of a member of the Lok Sabha.\n3. This Committee cannot take up any matter which is sub-judice.\nSelect the answer using the code given below:",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 11,
      "question": "Who was the Provisional President of the Constituent Assembly before Dr. Rajendra Prasad took over?",
      "options": [
        {
          "id": "a",
          "text": "C. Rajagopalachari"
        },
        {
          "id": "b",
          "text": "Dr. B.R. Ambedkar"
        },
        {
          "id": "c",
          "text": "T.T. Krishnamachari"
        },
        {
          "id": "d",
          "text": "Dr. Sachchidananda Sinha"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 12,
      "question": "With reference to the Government of India Act, 1935, consider the following statements:\n1. It provided for the establishment of an All India Federation based on the union of the British Indian Provinces and Princely States.\n2. Defence and Foreign Affairs were kept under the control of the federal legislature.\nWhich of the statements given above is/are correct?",
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
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 13,
      "question": "Which one of the following is a work attributed to playwright Bhasa?",
      "options": [
        {
          "id": "a",
          "text": "Kavyalankara"
        },
        {
          "id": "b",
          "text": "Natyashastra"
        },
        {
          "id": "c",
          "text": "Madhyama vyayoga"
        },
        {
          "id": "d",
          "text": "Mahabhashya"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 14,
      "question": "Sanghabhuti, an Indian Buddhist monk, who travelled to China at the end of the fourth century AD, was the author of a commentary on:",
      "options": [
        {
          "id": "a",
          "text": "Prajnaparamita Sutra"
        },
        {
          "id": "b",
          "text": "Visuddhimagga"
        },
        {
          "id": "c",
          "text": "Sarvastivada Vinaya"
        },
        {
          "id": "d",
          "text": "Lalitavistara"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 15,
      "question": "Consider the following properties included in the World Heritage List released by UNESCO:\n1. Shantiniketan\n2. Rani-ki-Vav\n3. Sacred Ensembles of the Hoysalas\n4. Mahabodhi Temple Complex at Bodhgaya\nHow many of the above properties were included in 2023?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 16,
      "question": "As per Article 368 of the Constitution of India, the Parliament may amend any provision of the Constitution by way of:\n1. Addition\n2. Variation\n3. Repeal\nSelect the correct answer using the code given below:",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 17,
      "question": "Consider the following countries:\n1. Italy\n2. Japan\n3. Nigeria\n4. South Korea\n5. South Africa\nWhich of the above countries are frequently mentioned in the media for their low birth rates, or ageing population or declining population?",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 4"
        },
        {
          "id": "b",
          "text": "1, 3 and 5"
        },
        {
          "id": "c",
          "text": "2 and 4 only"
        },
        {
          "id": "d",
          "text": "3 and 5 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Demographics",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 18,
      "question": "Which of the following statements are correct in respect of a Money Bill in the Parliament?\n1. Article 109 mentions special procedure in respect of Money Bills.\n2. A Money Bill shall not be introduced in the Council of States.\n3. The Rajya Sabha can either approve the Bill or suggest changes but cannot reject it.\n4. Amendments to a Money Bill suggested by the Rajya Sabha have to be accepted by the Lok Sabha.\nSelect the answer using the code given below:",
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
          "text": "1, 2 and 3"
        },
        {
          "id": "d",
          "text": "1, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 19,
      "question": "Which of the following is/are correctly matched in terms of equivalent rank in the three services of Indian Defence forces?\nArmy\tAirforce\tNavy\n1. Brigadier\tAir Commodore\tCommander\n2. Major General\tAir Vice Marshal\tVice Admiral\n3. Major\tSquadron Leader\tLieutenant commander\n4. Lieutenant Colonel\tGroup Captain\tCaptain\nSelect the correct answer using the code given below:",
      "options": [
        {
          "id": "a",
          "text": "1 and 4"
        },
        {
          "id": "b",
          "text": "1 and 3"
        },
        {
          "id": "c",
          "text": "2, 3 and 4"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 20,
      "question": "The North Eastern Council (NEC) was established by the North Eastern Council Act, 1971. Subsequent to the amendment of NEC Act in 2002, the Council comprises which of the following members?\n1. Governor of the Constituent State\n2. Chief Minister of the Constituent State\n3. Three Members to be nominated by the President of India\n4. The Home Minister of India\nSelect the Correct answer using the code given below:",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3 only"
        },
        {
          "id": "b",
          "text": "1, 3 and 4 only"
        },
        {
          "id": "c",
          "text": "2 and 4 only"
        },
        {
          "id": "d",
          "text": "1, 2, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 21,
      "question": "Consider the following statements regarding ‘Nari Shakti Vandan Adhiniyam’:\n1. Provisions will come into effect from the 18th Lok Sabha.\n2. This will be in force for 15 years after becoming an Act.\n3. There are provisions for the reservation of seats for scheduled Castes Women within the quota reserved for the Scheduled Castes.\nWhich of the statements given above are correct?",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
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
          "text": "1 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 22,
      "question": "Which of the following statements about ‘Exercise Mitra Shakti-2023’ are correct?\n1. This was a joint military exercise between India and Bangladesh.\n2. It commenced in Aundh (Pune).\n3. Joint response during counter-terrorism operations was a goal of this operation.\n4. Indian Air Force was a part of this exercise\nSelect the answer using the code given below:",
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
          "text": "2, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 23,
      "question": "A Writ of Prohibition is an order issued by the Supreme Court or High Courts to:",
      "options": [
        {
          "id": "a",
          "text": "a government officer prohibiting him from taking a particular action."
        },
        {
          "id": "b",
          "text": "the parliament/Legislative Assembly to pass a law on Prohibition."
        },
        {
          "id": "c",
          "text": "the lower court prohibiting continuation of proceedings in a case"
        },
        {
          "id": "d",
          "text": "the Government prohibiting it from following an unconstitutional policy"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 24,
      "question": "Consider the following statements:\n1. It is the Governor of the State who recognizes and declares any community of that State as a Scheduled Tribe.\n2. A community declared as a Scheduled Tribe in a State need not be so in another State.\nWhich of the statements given above is/are correct?",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Rights Issues",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 25,
      "question": "With reference to Union Budget, consider the following statements:\n1. The Union Finance Minister on behalf of the Prime Minister lays the Annual Financial Statement before both the House of Parliament.\n2. At the Union level, no demand for a grant can be made except on the recommendation of the President of India.\nWhich of the statements given above is/are correct?",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 26,
      "question": "Who of the following is the author of the books “The India Way” and “Why Bharat Matters”?",
      "options": [
        {
          "id": "a",
          "text": "Bhupender Yadav"
        },
        {
          "id": "b",
          "text": "Nalin Mehta"
        },
        {
          "id": "c",
          "text": "Shashi Tharoor"
        },
        {
          "id": "d",
          "text": "Subrahmanyam Jaishankar"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 27,
      "question": "Consider the following pairs:\nCountry\tReason for being in the news\n1. Argentina\tWorst economic crisis\n2. Sudan Forces\tWar between the country’s regular army and paramilitary\n3. Turkey\tRescinded its membership of NATO\nHow many of the pairs given above are correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one pair"
        },
        {
          "id": "b",
          "text": "Only two pairs"
        },
        {
          "id": "c",
          "text": "All three pairs"
        },
        {
          "id": "d",
          "text": "None of the pairs"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 28,
      "question": "Statement-I : Sumed pipeline is a strategic route for Persian Gulf oil and natural gas shipments to Europe.\nStatement-II : Sumed pipeline connects the Red Sea with the Mediterranean Sea.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Economic Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 29,
      "question": "Consider the following statements:\n1. The Red Sea receives very little precipitation in any form.\n2. No water enters the Red Sea from rivers.\nWhich of the statements given above is/are correct?",
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
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 30,
      "question": "According to the Environmental Protection Agency (EPA), which one of the following is the largest source of Sulphur dioxide emissions?",
      "options": [
        {
          "id": "a",
          "text": "Locomotives using fossil fuels"
        },
        {
          "id": "b",
          "text": "Ships using fossil fuels"
        },
        {
          "id": "c",
          "text": "Extraction of metals from ores"
        },
        {
          "id": "d",
          "text": "Power plants using fossil fuels."
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Environmental Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 31,
      "question": "Statement-I : If the United States of America (USA) were to default on its debt, holders of US Treasury Bonds will not be able to exercise their claims to receive payment.\nStatement-II : The USA Government debt is not backed by any hard assets, but only by the faith of the Government\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 32,
      "question": "Statement-l : Syndicated lending spreads the risk of borrower default across multiple lenders.\nStatement-II : The syndicated loan can be fixed amount/lump sum of funds, but cannot be a credit line\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 33,
      "question": "Consider the following statements in respect of the digital rupee:\n1. It is a sovereign currency issued by the Reserve Bank of India RBI alignment with its monetary policy.\n2. It appears as a liability on the RBI’s balance sheet.\n3. It is insured against inflation by its very design.\n4. It is freely convertible against commercial bank money and cash.\nWhich of the statements given above are correct?",
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
          "text": "2 and 4 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 34,
      "question": "With reference to ancient India, Gautama Buddha was generally known by which of the following epithets?\n1. Nayaputta\n2. Shakyamuni\n3. Tathagata\nSelect the correct answer using the code given below:",
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
          "text": "1, 2 and 3"
        },
        {
          "id": "d",
          "text": "None of the above are epithets of Gautama Buddha"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 35,
      "question": "Consider the following information –> Archaeological Site: State Description\nSalihundam – Andhra Pradesh Rock-cut cave shrines\nChandraketugarh – Odisha Trading Port town\nInamgaon – Maharashtra Chalcolithic site\nMangadu – Kerala Megalithic site\nIn which of the above rows is the given information correctly matched?",
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
          "text": "3 and 4"
        },
        {
          "id": "d",
          "text": "1 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 36,
      "question": "Who of the following rulers of medieval India gave permission to the Portuguese to build a fort at Bhatkal?",
      "options": [
        {
          "id": "a",
          "text": "Krishnadevaraya"
        },
        {
          "id": "b",
          "text": "Narasimha Saluva"
        },
        {
          "id": "c",
          "text": "Muhammad Shah III"
        },
        {
          "id": "d",
          "text": "Yusuf Adil Shah"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Medieval India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 37,
      "question": "With reference to revenue collection by Cornwallis, consider the following statements:\n1. Under the Ryotwari Settlement of revenue collection, the peasants were exempted from revenue payment in case of bad harvests or natural calamities.\n2. Under the Permanent Settlement in Bengal, if the Zamindar failed to pay his revenues to the state, on or before the fixed date, he would be removed from his Zamindari.\nWhich of the statements given above is/are correct?",
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
      "microsyllabusHint": "Modern India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 38,
      "question": "Consider the following statements:\n1. There are parables in Upanishads.\n2. Upanishads were composed earlier than the Puranas\nWhich of the statements given above is/are correct?",
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
          "text": "Neither I nor 2"
        }
      ],
      "correctOptionId": null,
      "subject": "History",
      "microsyllabusHint": "Ancient India",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 39,
      "question": "Consider the following statements:\n1. India is a member of the International Grains Council.\n2. A country needs to be a member of the International Grains Council for exporting or importing rice and wheat.\nWhich of the statements given above is/are correct?",
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
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 40,
      "question": "Which one of the following was the latest inclusion in the Intangible Cultural Heritage List of UNESCO?",
      "options": [
        {
          "id": "a",
          "text": "Chhau dance"
        },
        {
          "id": "b",
          "text": "Durga puja"
        },
        {
          "id": "c",
          "text": "Garba dance"
        },
        {
          "id": "d",
          "text": "Kumbh mela"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 41,
      "question": "Statement-I : There is instability and worsening security situation in the Sahel region.\nStatement-II : There have been military takeovers/coups d’etat in several countries of the Sahel region in the recent past.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II in correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 42,
      "question": "Statement-I : India does not import apples from the United States of America.\nStatement-II : In India, the law prohibits the import of Genetically Modified food without the approval of the competent authority.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 43,
      "question": "With reference to the Speaker of the Lok Sabha, consider the following statements: While any resolution for the removal of the Speaker of the Lok Sabha is under consideration\n1. He/She shall not preside\n2. He/She shall not have the right to speak\n3. He/She shall not be entitled to vote on the resolution in the first instance.\nWhich of the statements given above is/are correct",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 44,
      "question": "With reference to the Indian Parliament, consider the following statements:\n1. A bill pending in the Lok Sabha lapses on its dissolution\n2. A bill passed by the Lok Sabha and pending in the Rajya Sabha lapses on the dissolution of the Lok Sabha.\n3. A bill in regard to which the President of India notified his/her intention to summon the Houses to a joint sitting lapses on the dissolution of the Lok Sabha.\nWhich of the statements given above is/are correct?",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 45,
      "question": "With reference to the Parliament of India, consider the following statements:\n1. Prorogation of a House by the President of India does not require the advice of the Council of Ministers.\n2. Prorogation of a House is generally done after the House is adjourned sine die but there is no bar to the President of India prorogating the House which is in session.\n3. Dissolution of the Lok Sabha is done by the President of India who, save in exceptional circumstances, does so on the advice of the Council of Ministers\nWhich of the statements given above is/are correct?",
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
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 46,
      "question": "Statement-I: The European Parliament approved The Net-Zero Industry Act recently.\nStatement-II: The European Union intends to achieve carbon neutrality by 2040 and therefore aims to develop all of its own clean technology by that time.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-I Statement-II explains"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 47,
      "question": "Statement-I: Recently, Venezuela has achieved a rapid recovery from its economic crisis and succeeded in preventing its people from fleeing/emigrating to other countries.\nStatement-II: Venezuela has the world’s largest oil reserves\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 48,
      "question": "With reference to the Digital India Land Records Modernisation Programme, consider the following statements:\n1. To implement the scheme, the Central Government provides 100% funding.\n2. Under the Scheme, Cadastral Maps are digitised.\n3. An initiative has been undertaken to transliterate the Records of Rights from local language to any of the languages recognized by the Constitution of India.\nWhich of the statements given above are correct?",
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
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Social Sector Initiatives",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 49,
      "question": "With reference to the ‘Pradhan Mantri Surakshit Matritva Abhiyan’, consider the following statements\n1. This scheme guarantees a minimum package of antenatal care services to women in their second and third trimesters of pregnancy and six months post-delivery health care service in any government health facility\n2. Under this scheme, private sector health care providers of certain specialities can volunteer to provide services at nearby government health facilities.\nWhich of the statements given above is/are correct?",
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
      "microsyllabusHint": "Social Sector Initiatives",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 50,
      "question": "With reference to the Pradhan Mantri Shram Yogi Maan-dhan (PM-SYM) Yojana, consider the following statements:\n1. The entry age group for enrolment in the scheme is 21 to 40 years.\n2. Age specific contribution shall be made by the beneficiary.\n3. Each subscriber under the scheme shall receive a minimum pension of 3,000 per month after attaining the age of 60 years.\n4. Family pension is applicable to the spouse and unmarried daughters.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1, 3 and 4"
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
          "text": "1, 2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Social Sector Initiatives",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 51,
      "question": "Statement-I: The atmosphere is heated more by incoming solar radiation than by terrestrial radiation.\nStatement-II: Carbon dioxide and other greenhouse gases in the atmosphere are good absorbers of long wave radiation.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 52,
      "question": "Statement-I: Thickness of the troposphere at the equator is much greater as compared to poles.\nStatement-II: At the equator, heat is transported to great heights by strong convectional currents.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-I Statement-II explains"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 53,
      "question": "Consider the following:\n1. Pyroclastic debris\n2. Ash and dust\n3. Nitrogen compounds\n4. Sulphur compounds\nHow many of the above are products of volcanic eruptions?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 54,
      "question": "Which of the following is/are correct inference/inferences from isothermal maps in the month of January?\n1. The isotherms deviate to the north over the ocean and to the south over the continent.\n2. The presence of cold ocean currents, Gulf Stream and North Atlantic Drift make the North Atlantic Ocean colder and the isotherms bend towards the north.\nSelect the answer using the code given below:",
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
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 55,
      "question": "Which of the following countries are well known as the two largest cocoa producers in the world?",
      "options": [
        {
          "id": "a",
          "text": "Algeria and Morocco"
        },
        {
          "id": "b",
          "text": "Botswana and Namibia"
        },
        {
          "id": "c",
          "text": "Cote d’ Ivoire Coast and Ghana"
        },
        {
          "id": "d",
          "text": "Madagascar and Mozambique"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Economic Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 56,
      "question": "With reference to the Himalayan rivers joining the Ganga downstream of Prayagraj from West to East, which one of the following sequences is correct?",
      "options": [
        {
          "id": "a",
          "text": "Ghaghara – Gomati – Gandak – Kosi"
        },
        {
          "id": "b",
          "text": "Gomati – Ghaghara – Gandak – Kosi"
        },
        {
          "id": "c",
          "text": "Ghaghara – Gomati – Kosi – Gandak"
        },
        {
          "id": "d",
          "text": "Gomati – Ghaghara – Kosi – Gandak"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 57,
      "question": "Statement-I: Rainfall is one of the reasons for weathering of rocks.\nStatement-II: Rain water contains carbon dioxide in solution.\nStatement-III: Rain water contains atmospheric oxygen.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-II and Statement-III are correct and both of them explain Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-II and Statement-III are correct, but only one of them explains Statement-I"
        },
        {
          "id": "c",
          "text": "Only one of the Statements II and III is correct and that explains Statement-I"
        },
        {
          "id": "d",
          "text": "Neither Statement-II nor Statement-III is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 58,
      "question": "Consider the following countries:\n1. Finland\n2. Germany\n3. Norway\n4. Russia\nHow many of the above countries have a border with the North Sea?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 59,
      "question": "Consider the following information:\nWaterfall\tRegion\tRiver\n1. Dhuandhar\tMalwa\tNarmada\n2. Hundru\tChota Nagpur\tSubarnarekha\n3. Gersoppa\tWestern Ghats\tNetravati\nIn how many of the above rows is the given information correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 60,
      "question": "Consider the following information:\nRegion\tName of the mountain range\tType of mountain\n1. Central\tVosges\tFold mountain\n2. Europe\tAlps\tBlock mountain\n3. North America\tAppalachians\tFold mountain\n4. South America\tAndes\tFold mountain\nIn how many of the above rows is the given information correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 61,
      "question": "The organisms “Cicada, Froghopper and Pond skater” are:",
      "options": [
        {
          "id": "a",
          "text": "Birds"
        },
        {
          "id": "b",
          "text": "Fish"
        },
        {
          "id": "c",
          "text": "Insects"
        },
        {
          "id": "d",
          "text": "Reptiles"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 62,
      "question": "Statement-I: Many chewing gums found in the market are considered a source of environmental pollution.\nStatement-II: Many chewing gums contain plastic as gum base.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Environmental Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 63,
      "question": "Consider the following pair:\nCountry\tAnimal found in its natural habitat\n1. Brazil\tIndri\n2. Indonesia\tElk\n3. Madagascar\tBonobo\nHow many of the pairs given above are correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "All three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 64,
      "question": "Consider the following statements regarding World Toilet Organization:\n1. It is one of the agencies of the United Nations.\n2. World Toilet Summit, World Toilet Day and World Toilet College are the initiatives of this organization, to inspire action to tackle the global sanitation crisis.\n3. The main focus of its function is to grant funds to the least developed countries and developing countries to achieve the end of open defecation.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "2 only"
        },
        {
          "id": "b",
          "text": "3 only"
        },
        {
          "id": "c",
          "text": "1 and 2"
        },
        {
          "id": "d",
          "text": "2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 65,
      "question": "Consider the following statements:\n1. Lions do not have a particular breeding season.\n2. Unlike most other big cats, cheetahs do not roar.\n3. Unlike male lions, male leopards do not proclaim their territory by scent marking.\nWhich of the statements given above are correct?",
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
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 66,
      "question": "Which one of the following is the correct description of “100 Million Farmers”?",
      "options": [
        {
          "id": "a",
          "text": "It is a platform for accelerating the transition towards food and water systems that are net-zero (carbon), nature-positive and that aims to increase farmer resilience."
        },
        {
          "id": "b",
          "text": "It is an international alliance and a network of individuals and farming organisations interested in supporting and strengthening the development of the organic animal husbandry."
        },
        {
          "id": "c",
          "text": "It is a digital platform fully integrated with service providers and built on blockchain that lets buyers, sellers and third parties trade fertilizers quickly and securely."
        },
        {
          "id": "d",
          "text": "It is a platform with the mission of encouraging the farmers to form Farmer Product Organisations or Agribusiness Consortiums, thus facilitating the access to global open markets to sell their products."
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Sustainable Development",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 67,
      "question": "Consider the following:\n1. Battery storage\n2. Biomass generators\n3. Fuel cells\n4. Rooftop solar photovoltaic units\nHow many of the above are considered “Distributed Energy Resources”?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 68,
      "question": "Which one of the following shows a unique relationship with an insect that has coevolved with it and that is the only insect that can pollinate this tree?",
      "options": [
        {
          "id": "a",
          "text": "Fig"
        },
        {
          "id": "b",
          "text": "Mahua"
        },
        {
          "id": "c",
          "text": "Sandalwood"
        },
        {
          "id": "d",
          "text": "Silk cotton"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 69,
      "question": "Consider the following:\n1. Butterflies\n2. Fish\n3. Frogs\nHow many of the above have poisonous species among them?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "All three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 70,
      "question": "Consider the following:\n1. Cashew\n2. Papaya\n3. Red sanders\nHow many of the above trees are actually native to India?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "All three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 71,
      "question": "Consider the following airports:\n1. Donyi Polo Airport\n2. Kushinagar International Airport\n3. Vijayawada International Airport\nIn the recent past, which of the above have been constructed as Greenfield projects?",
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
          "text": "2 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 72,
      "question": "With reference to “water vapour”, which of the following statements is/are correct?\n1. It is a gas, the amount of which decreases with altitude.\n2. Its percentage is maximum at the poles.\nSelect the answer using the code given below:",
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
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 73,
      "question": "Consider the following description:\n1. Annual and daily range of temperatures is low.\n2. Precipitation occurs throughout the year.\n3. Precipitation varies between 50cm – 250cm.\nWhat is this type of climate?",
      "options": [
        {
          "id": "a",
          "text": "Equatorial climate"
        },
        {
          "id": "b",
          "text": "China type climate"
        },
        {
          "id": "c",
          "text": "Humid subtropical climate"
        },
        {
          "id": "d",
          "text": "Marine West coast climate"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 74,
      "question": "With reference to “Coriolis force”, which of the following statements is/are correct?\n1. It increases with increase in wind velocity.\n2. It is maximum at the poles and is absent at the equator.\nSelect the answer using the code given below:",
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
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 75,
      "question": "On June 21 every year, which of the following latitude(s) experience(s) a sunlight of more than 12 hours?\n1. Equator\n2. Tropic of Cancer\n3. Tropic of Capricorn\n4. Arctic Circle\nSelect the correct answer using the code given below:",
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
          "text": "3 and 4"
        },
        {
          "id": "d",
          "text": "2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Geography",
      "microsyllabusHint": "Physical Geography",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 76,
      "question": "One of the following regions has the world’s largest tropical peatland, which holds about three years worth of global carbon emissions from fossil fuels; and the possible destruction of which can exert detrimental effect on the global climate. Which one of the following denotes that region?",
      "options": [
        {
          "id": "a",
          "text": "Amazon Basin"
        },
        {
          "id": "b",
          "text": "Congo Basin"
        },
        {
          "id": "c",
          "text": "Kikori Basin"
        },
        {
          "id": "d",
          "text": "Rio de la Plata Basin"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Environmental Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 77,
      "question": "With reference to perfluoroalkly and polyfluoroalkyl substances (PFAS) that are used in making many consumer products, consider the following statements:\n1. PFAS are found to be widespread in drinking water, food and food packaging materials.\n2. PFAS are not easily degraded in the environment.\n3. Persistent exposure to PFAS can lead to bioaccumulation in animal bodies.\nWhich of the statements given above are correct?",
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
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Environmental Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 78,
      "question": "Consider the following:\n1. Carabid beetles\n2. Centipedes\n3. Flies\n4. Termites\n5. Wasps\nParasitoid species are found in how many of the above kind of organisms?",
      "options": [
        {
          "id": "a",
          "text": "Only two"
        },
        {
          "id": "b",
          "text": "Only three"
        },
        {
          "id": "c",
          "text": "Only four"
        },
        {
          "id": "d",
          "text": "All five"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 79,
      "question": "Consider the following plants:\n1. Groundnut\n2. Horse-gram\n3. Soybean\nHow many of the above belong to the pea family?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 80,
      "question": "Statement-I: The Indian Flying Fox is placed under the “vermin” category in the Wild Life (Protection) Act, 1972.\nStatement-II: The Indian Flying Fox feeds on the blood of other animals.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Biodiversity",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 81,
      "question": "The total fertility rate in an economy is defined as:",
      "options": [
        {
          "id": "a",
          "text": "the number of children born per 1000 people in the population in a year."
        },
        {
          "id": "b",
          "text": "the number of children born to a couple in their lifetime in a given population."
        },
        {
          "id": "c",
          "text": "the birth rate minus death rate."
        },
        {
          "id": "d",
          "text": "the average number of live births a woman would have by the end of her child-bearing age."
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Demographics",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 82,
      "question": "Consider the following statements:\n1. In India, Non-Banking Financial Companies can access the Liquidity Adjustment Facility window of the Reserve Bank of India.\n2. In India, Foreign Institutional Investors can hold the Government Securities (G-Secs).\n3. In India, Stock Exchanges can offer separate trading platforms for debts.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "3 only"
        },
        {
          "id": "c",
          "text": "1, 2 and 3"
        },
        {
          "id": "d",
          "text": "2 and 3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 83,
      "question": "In India, which of the following can trade in Corporate Bonds and Government Securities?\n1. Insurance Companies\n2. Pension Funds\n3. Retail Investors\nSelect the correct answer using the code given below:",
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
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 84,
      "question": "Consider the following:\n1. Exchange-Traded Funds (ETF)\n2. Motor vehicls\n3. Currency swap\nWhich of the above is/are considered financial instruments?",
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
          "text": "1, 2 and 3"
        },
        {
          "id": "d",
          "text": "1 and 3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 85,
      "question": "With reference to the sectors of the Indian economy, consider the following pairs:\nEconomic activity\tSector\n1. Storage of agricultural produce\tSecondary\n2. Dairy farm\tPrimary\n3. Mineral exploration\tTertiary\n4. Weaving cloth\tSecondary\nHow many of the pairs given above are correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 86,
      "question": "Consider the following materials:\n1. Agricultural residues\n2. Corn grains\n3. Wastewater treatment sludge\n4. Wood mill waste\nWhich of the above can be used as feedstock for producing Sustainable Aviation Fuel?",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "2 and 4 only"
        },
        {
          "id": "c",
          "text": "1, 2, 3 and 4"
        },
        {
          "id": "d",
          "text": "1, 3 and 4 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 87,
      "question": "With reference to physical capital in Indian economy, consider the following pairs:\nItems\tCategory\n1. Farmer’s plough\tWorking capital\n2. Computer\tFixed capital\n3. Yarn used by the weaver\tFixed capital\n4. Petrol\tWorking capital\nHow many of the above pairs are correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "All four"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 88,
      "question": "Which one of the following words/phrases is most appropriately used to denote “an interoperable network of 3D virtual worlds that can be accessed simultaneously by millions of users, who can exert property rights over virtual items.”?",
      "options": [
        {
          "id": "a",
          "text": "Big data analytics"
        },
        {
          "id": "b",
          "text": "Cryptography"
        },
        {
          "id": "c",
          "text": "Metaverse"
        },
        {
          "id": "d",
          "text": "Virtual matrix"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "General Science",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 89,
      "question": "With reference to the rule/rules imposed by the Reserve Bank of India while treating foreign banks, consider the following statements:\n1. There is no minimum capital requirement for wholly owned banking subsidiaries in India.\n2. For wholly owned banking subsidiaries in India, at least 50% of the board members should be Indian nationals.\nWhich of the statements given above is/are correct?",
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
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 90,
      "question": "With reference to Corporate Social Responsibility (CSR) rules in India, consider the following statements:\n1. CSR rules specify that expenditures that benefit the company directly or the employees will not be considered as CSR activities.\n2. CSR rules do not specify minimum spending on CSR activities.\nWhich of the statements given above is/are correct?",
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
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 91,
      "question": "With reference to radioisotope thermoelectric generators (RTGs), consider the following statements:\n1. RTGs are miniature fission reactors\n2. RTGs are used for powering the onboard systems of spacecrafts.\n3. RTGs can use Plutonium-238, which is a by-product of weapons development.\nWhich of the statements given above are correct?",
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
      "subject": "Science & Technology",
      "microsyllabusHint": "General Science",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 92,
      "question": "Statement-I: Giant stars live much longer than dwarf stars.\nStatement-II: Compared to dwarf stars, giant stars have a greater rate of nuclear reactions.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement-I and Statement-II are correct and Statement-II explains Statement-I"
        },
        {
          "id": "b",
          "text": "Both Statement-I and Statement-II are correct but and Statement-II does not explains Statement-I"
        },
        {
          "id": "c",
          "text": "Statement-I is correct, but Statement-II is incorrect"
        },
        {
          "id": "d",
          "text": "Statement-I is incorrect, but Statement-II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "General Science",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 93,
      "question": "Which one of the following is synthesised in human body that dilates blood vessels and increase blood flow?",
      "options": [
        {
          "id": "a",
          "text": "Nitric oxide"
        },
        {
          "id": "b",
          "text": "Nitrous oxide"
        },
        {
          "id": "c",
          "text": "Nitrogen dioxide"
        },
        {
          "id": "d",
          "text": "Nitrogen pentoxide"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "General Science",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 94,
      "question": "Consider the following activities:\n1. Identification of narcotics on passengers at airports or in aircraft\n2. Monitoring of precipitation\n3. Tracking the migration of animals\nIn how many of the above activities can the radars be used?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "All three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 95,
      "question": "Consider the following aircraft:\n1. Rafael\n2. MiG-29\n3. Tejas MK-1\nHow many of the above are considered fifth generation fighter aircraft?",
      "options": [
        {
          "id": "a",
          "text": "Only one"
        },
        {
          "id": "b",
          "text": "Only two"
        },
        {
          "id": "c",
          "text": "All three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 96,
      "question": "In which of the following are hydrogels used?\n1. Controlled drug delivery in patients\n2. Mobile air-conditioning systems\n3. Preparation of industrial lubricants.\nSelect the correct answer using the code given below:",
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
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 97,
      "question": "Which one of the following is the exhaust pipe emission from Fuel Cell Electric Vehicles, powered by hydrogen?",
      "options": [
        {
          "id": "a",
          "text": "Hydrogen peroxide"
        },
        {
          "id": "b",
          "text": "Hydronium"
        },
        {
          "id": "c",
          "text": "Oxygen"
        },
        {
          "id": "d",
          "text": "Water vapour"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 98,
      "question": "Recently the term “pumped-storage hydropower” is actually and appropriately discussed in the context of which one of the following?",
      "options": [
        {
          "id": "a",
          "text": "Irrigation of terraced crop fields"
        },
        {
          "id": "b",
          "text": "Lift irrigation of cereal crops"
        },
        {
          "id": "c",
          "text": "Long duration energy storage"
        },
        {
          "id": "d",
          "text": "Rainwater harvesting system"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 99,
      "question": "“Membrane Bioreactors” are often discussed in the context of",
      "options": [
        {
          "id": "a",
          "text": "Assisted reproductive technologies"
        },
        {
          "id": "b",
          "text": "Drug delivery nanotechnologies"
        },
        {
          "id": "c",
          "text": "Vaccine production technologies"
        },
        {
          "id": "d",
          "text": "Wastewater treatment technologies"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 100,
      "question": "With reference to the Indian economy, “Collateral Borrowing and Lending Obligations” are the instruments of:",
      "options": [
        {
          "id": "a",
          "text": "Bond market"
        },
        {
          "id": "b",
          "text": "Forex market"
        },
        {
          "id": "c",
          "text": "Money market"
        },
        {
          "id": "d",
          "text": "Stock market."
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    }
  ]
};
