import type { UpscCsePrelimsPyqBatchFile } from '../lib/upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims 2025, GS Paper I, Questions 1-100 (Set A) — a pre-processed batch built from the
// exact question-paper text the user pasted directly into this Claude Code session (see the
// 'source' field below; no file was uploaded, so no sourceFilename is recorded). Every
// question/option field below is transcribed VERBATIM from that pasted text — this file itself was
// generated programmatically from the pasted text to guarantee byte-for-byte fidelity (no manual
// retyping of 100 questions' worth of text). Never re-parsed from a different source, never
// re-fetched, and never edited by hand — see lib/upscCsePrelimsPyqBatchImport.ts for what VALIDATEs
// and RESOLVEs this raw batch into data/pyqUpscCsePrelims.ts's actual destination records.
// correctOptionId is null throughout: this batch carries no answer key at the batch level — the
// separately-supplied Set A answer key (data/upscCsePrelimsAnswerKey2025SetARaw.ts) is attached on
// top afterwards, the same two-step process the 2026 batches already use. subject/microsyllabusHint
// are null on every question — no topic/subject classification was supplied with this batch, so
// every question is necessarily needs_review, never guessed from question content. This batch is
// entirely separate from, and never modifies, the existing 2026 UPSC CSE Prelims batches.
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100: UpscCsePrelimsPyqBatchFile = {
  "schema": "upsc-cse-prelims-user-supplied-pyq-batch",
  "schemaVersion": 1,
  "exam": "UPSC CSE",
  "stage": "prelims",
  "paper": "GS Paper I",
  "year": 2025,
  "questionRange": "1-100",
  "source": {
    "kind": "user_provided_text",
    "answerKeyProvided": false,
    "verificationStatus": "provisional"
  },
  "important": [
    "Question and option text was transcribed verbatim from text the user pasted directly into this Claude Code session (SET-A question paper) — no external source was used, and no file was uploaded.",
    "correctOptionId is intentionally null throughout: this batch carries no answer key at the batch level. The supplied Set A answer key is attached separately (see data/upscCsePrelimsAnswerKey2025SetARaw.ts and lib/upscCsePrelimsAnswerKeyAttach.ts).",
    "subject and microsyllabusHint are null on every question — no topic/subject classification was supplied with this batch, so every question is necessarily needs_review; never guessed from question content.",
    "The user also supplied SET B/SET C/SET D answer-key columns, but only the SET A question paper's text was supplied. SET B/C/D answers are therefore not integrated (their own question/option orderings were never supplied, so attaching those letters would require guessing which option each letter refers to)."
  ],
  "questions": [
    {
      "questionNumber": 1,
      "question": "With reference to investments, consider the following:\nBonds\nHedge Funds\nStocks\nVenture Capital\nHow many of the above are treated as Alternative Investment Funds (AIFs)?",
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
          "text": "All the four"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 2,
      "question": "Which of the following are the sources of income for the Reserve Bank of India?\nBuying and selling Government bonds\nBuying and selling foreign currency\nPension fund management\nLending to private companies\nPrinting and distributing currency notes\nSelect the correct answer using the code given below:",
      "options": [
        {
          "id": "a",
          "text": "1 and 2 only"
        },
        {
          "id": "b",
          "text": "2, 3 and 4"
        },
        {
          "id": "c",
          "text": "1, 3, 4 and 5"
        },
        {
          "id": "d",
          "text": "1, 2 and 5"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 3,
      "question": "With reference to the Government of India, consider the following information:\nOrganisation\tSome of its function\tIt works under\n1\tDirectorate of Enforcement\tEnforcement of the Fugitive Economic Offenders Act, 2018\tInternal Security Division–I, Ministry of Home Affairs\n2\tDirectorate of Revenue Intelligence\tEnforces the Provisions of the Customs Act, 1962\tDepartment of Revenue, Ministry of Finance\n3\tDirectorate General of Systems and Data Management\tCarrying out big data analytics to assist tax officers for better policy and nabbing tax evaders\tDepartment of Revenue, Ministry of Finance\nIn how many of the above rows is the information correctly matched?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 4,
      "question": "Consider the following statements:\nThe Reserve Bank of India mandates all the listed companies in India to submit a Business Responsibility and Sustainability Report (BRSR).\nIn India, a company submitting a BRSR makes disclosures in the report that are largely non-financial in nature.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 5,
      "question": "Consider the following statements:\nIn India, income from allied agricultural activities like poultry farming and wool rearing in rural areas is exempted from any tax.\nIn India, rural agricultural land is not considered a capital asset under the provisions of the Income-tax Act, 1961.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 1 and Statement 2 are correct and Statement 2 explains Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 1 and Statement 2 are correct but Statement 2 does not explain Statement 1"
        },
        {
          "id": "c",
          "text": "Statement 1 is correct but Statement 2 is not correct"
        },
        {
          "id": "d",
          "text": "Statement 1 is not correct but Statement 2 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 6,
      "question": "Consider the following statements:\nIndia has joined the Minerals Security Partnership as a member.\nIndia is a resource-rich country in all the 30 critical minerals that it has identified.\nThe Parliament in 2023 has amended the Mines and Minerals (Development and Regulation) Act, 1957 empowering the Central Government to exclusively auction mining lease and composite license for certain critical minerals.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 7,
      "question": "Consider the following statements:\nStatement I: As regards returns from an investment in a company, generally, bondholders are considered to be relatively at lower risk than stockholders.\nStatement II: Bondholders are lenders to a company whereas stockholders are its owners.\nStatement III: For repayment purpose, bondholders are prioritized over stockholders by a company.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement II and Statement III are correct and both of them explain Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement I and Statement II are correct and Statement I explains Statement II"
        },
        {
          "id": "c",
          "text": "Only one of the Statements II and III is correct and that explains Statement I"
        },
        {
          "id": "d",
          "text": "Neither Statement II nor Statement III is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 8,
      "question": "Consider the following statements:\nIndia accounts for a very large portion of all equity option contracts traded globally thus exhibiting a great boom.\nIndia’s stock market has grown rapidly in the recent past even overtaking Hong Kong’s at some point of time.\nThere is no regulatory body either to warn the small investors about the risks of options trading or to act on unregistered financial advisors in this regard.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 9,
      "question": "Consider the following statements:\nCircular economy reduces the emissions of greenhouse gases.\nCircular economy reduces the use of raw materials as inputs.\nCircular economy reduces wastage in the production process.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement II and Statement III are correct and both of them explain Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement II and Statement III are correct but only one of them explains Statement I"
        },
        {
          "id": "c",
          "text": "Only one of the Statements II and III is correct and that explains Statement I"
        },
        {
          "id": "d",
          "text": "Neither Statement II nor Statement III is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 10,
      "question": "Consider the following statements:\nCapital receipts create a liability or cause a reduction in the assets of the Government.\nBorrowings and disinvestment are capital receipts.\nInterest received on loans creates a liability of the Government.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 11,
      "question": "Consider the following statements about Raja Ram Mohan Roy:\nHe possessed great love and respect for the traditional philosophical systems of the East.\nHe desired his countrymen to accept the rational and scientific approach and the principle of human dignity and social equality of all men and women.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 12,
      "question": "Consider the following subjects with regard to Non-Cooperation Programme:\nBoycott of law-courts and foreign cloth\nObservance of strict non-violence\nRetention of titles and honours without using them in public\nEstablishment of Panchayats for settling disputes\nHow many of the above were parts of Non-Cooperation Programme?",
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
          "text": "All the four"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 13,
      "question": "The irrigation device called ‘Araghatta’ was",
      "options": [
        {
          "id": "a",
          "text": "a water bag made of leather pulled over a pulley"
        },
        {
          "id": "b",
          "text": "a large wheel with earthen pots tied to the outer ends of its spokes"
        },
        {
          "id": "c",
          "text": "a larger earthen pot driven by bullocks"
        },
        {
          "id": "d",
          "text": "a large water bucket pulled up by rope directly by hand"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 14,
      "question": "Who among the following rulers in ancient India had assumed the titles ‘Mattavilasa’, ‘Vichitrachitta’ and ‘Gunabhara’?",
      "options": [
        {
          "id": "a",
          "text": "Mahendravarman I"
        },
        {
          "id": "b",
          "text": "Simhavishnu"
        },
        {
          "id": "c",
          "text": "Narasimhavarman I"
        },
        {
          "id": "d",
          "text": "Simhavarman"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 15,
      "question": "Fa-hien (Faxian), the Chinese pilgrim, travelled to India during the reign of",
      "options": [
        {
          "id": "a",
          "text": "Samudragupta"
        },
        {
          "id": "b",
          "text": "Chandragupta II"
        },
        {
          "id": "c",
          "text": "Kumaragupta I"
        },
        {
          "id": "d",
          "text": "Skandagupta"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 16,
      "question": "Who among the following led a successful military campaign against the kingdom of Srivijaya, the powerful maritime State, which ruled the Malay Peninsula, Sumatra, Java and the neighbouring islands?",
      "options": [
        {
          "id": "a",
          "text": "Amoghavarsha (Rashtrakuta)"
        },
        {
          "id": "b",
          "text": "Prataparudra (Kakatiya)"
        },
        {
          "id": "c",
          "text": "Rajendra I (Chola)"
        },
        {
          "id": "d",
          "text": "Vishnuvardhana (Hoysala)"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 17,
      "question": "With reference to ancient India (600-322 BC), consider the following pairs:\nTerritorial region\tRiver flowing in the region\n1. Asmaka\tGodavari\n2. Kamboja\tVipas\n3. Avanti\tMahanadi\n4. Kosala\tSarayu\nHow many of the pairs given above are correctly matched?",
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
          "text": "All the four"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 18,
      "question": "The first Gandharva Mahavidyalaya, a music training school, was set up in 1901 by Vishnu Digambar Paluskar in",
      "options": [
        {
          "id": "a",
          "text": "Delhi"
        },
        {
          "id": "b",
          "text": "Gwalior"
        },
        {
          "id": "c",
          "text": "Ujjain"
        },
        {
          "id": "d",
          "text": "Lahore"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 19,
      "question": "Ashokan inscriptions suggest that the ‘Pradeshika’, ‘Rajuka’ and ‘Yukta’ were important officers at the",
      "options": [
        {
          "id": "a",
          "text": "village-level administration"
        },
        {
          "id": "b",
          "text": "district-level administration"
        },
        {
          "id": "c",
          "text": "provincial administration"
        },
        {
          "id": "d",
          "text": "level of the central administration"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 20,
      "question": "Consider the following statements in respect of the Non-Cooperation Movement:\nThe Congress declared the attainment of ‘Swaraj’ by all legitimate and peaceful means to be its objective.\nIt was to be implemented in stages with civil disobedience and non-payment of taxes for the next stage only if ‘Swaraj’ did not come within a year and the Government resorted to repression.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 21,
      "question": "Consider the following countries:\nAustria\nBulgaria\nCroatia\nSerbia\nSweden\nNorth Macedonia\nHow many of the above are members of the North Atlantic Treaty Organization?",
      "options": [
        {
          "id": "a",
          "text": "Only three"
        },
        {
          "id": "b",
          "text": "Only four"
        },
        {
          "id": "c",
          "text": "Only five"
        },
        {
          "id": "d",
          "text": "All the six"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 22,
      "question": "Consider the following countries:\nBolivia\nBrazil\nColombia\nEcuador\nParaguay\nVenezuela\nAndes mountains pass through how many of the above countries?",
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
          "text": "Only five"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 23,
      "question": "Consider the following water bodies:\nLake Tanganyika\nLake Tonle Sap\nPatos Lagoon\nThrough how many of them does the equator pass?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 24,
      "question": "Consider the following statements about turmeric during the year 2022-23:\nIndia is the largest producer and exporter of turmeric in the world.\nMore than 30 varieties of turmeric are grown in India.\nMaharashtra, Telangana, Karnataka and Tamil Nadu are major turmeric producing States in India.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 25,
      "question": "Which of the following are the evidences of the phenomenon of continental drift?\nThe belt of ancient rocks from Brazil coast matches with those from Western Africa.\nThe gold deposits of Ghana are derived from the Brazil plateau when the two continents lay side by side.\nThe Gondwana system of sediments from India is known to have its counterparts in six different landmasses of the Southern Hemisphere. Select the correct answer using the code given below.",
      "options": [
        {
          "id": "a",
          "text": "1 and 3 only"
        },
        {
          "id": "b",
          "text": "1 and 2 only"
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 26,
      "question": "Consider the following statements:\nStatement I: The amount of dust particles in the atmosphere is more in subtropical and temperate areas than in equatorial and polar regions.\nStatement II: Subtropical and temperate areas have less dry winds.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement I and Statement II are correct and Statement II explains Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement I and Statement II are correct but Statement II does not explain Statement I"
        },
        {
          "id": "c",
          "text": "Statement I is correct but Statement II is not correct"
        },
        {
          "id": "d",
          "text": "Statement I is not correct but Statement II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 27,
      "question": "Consider the following statements:\nStatement I: In January, in the Northern Hemisphere, the isotherms bend equatotward while crossing the landmasses, and poleward while crossing the oceans.\nStatement II: In January, the air over the oceans is warmer than that over the landmasses in the Northern Hemisphere.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement I and Statement II are correct and Statement II explains Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement I and Statement II are correct but Statement II does not explain Statement I"
        },
        {
          "id": "c",
          "text": "Statement I is correct but Statement II is not correct"
        },
        {
          "id": "d",
          "text": "Statement I is not correct but Statement II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 28,
      "question": "Consider the following statements:\nStatement I: In the context of effect of water on rocks, chalk is known as a very permeable rock whereas clay is known as quite an impermeable or least permeable rock.\nStatement II: Chalk is porous and hence can absorb water.\nStatement III: Clay is not at all porous.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement II and Statement III are correct and both of them explain Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement II and Statement III are correct but only one of them explains Statement I"
        },
        {
          "id": "c",
          "text": "Only one of the Statements II and III is correct and that explains Statement I"
        },
        {
          "id": "d",
          "text": "Neither Statement II nor Statement III is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 29,
      "question": "Consider the following statements:\nWithout the atmosphere, temperature would be well below freezing point everywhere on the Earth’s surface.\nHeat absorbed and trapped by the atmosphere maintains our planet’s average temperature.\nAtmosphere’s gases, like carbon dioxide, are particularly good at absorbing and trapping radiation.\nWhich of the statements given above are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 and 3 only"
        },
        {
          "id": "b",
          "text": "1 and 2 only"
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 30,
      "question": "Consider the following statements about the Rashtriya Gokul Mission:\nIt is important for the upliftment of rural poor as majority of low producing indigenous animals are with small and marginal farmers and landless labourers.\nIt was initiated to promote indigenous cattle and buffalo rearing and conservation in a scientific and holistic manner.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 31,
      "question": "Consider the following statements:\nStatement 1: Studies indicate that carbon dioxide emissions from cement industry account for more than 5% of global carbon emissions.\nStatement 2: Silica-bearing clay is mixed with limestone while manufacturing cement.\nStatement 3: Limestone is converted into lime during clinker production for cement manufacturing.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 2 and Statement 3 are correct and both of them explain Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 2 and Statement 3 are correct but only one of them explains Statement 1"
        },
        {
          "id": "c",
          "text": "Only one of the Statements 2 and 3 is correct and that explains Statement 1"
        },
        {
          "id": "d",
          "text": "Neither Statement 2 nor Statement 3 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 32,
      "question": "Consider the following statements:\nStatement 1: At the 28th United Nations Climate Change Conference (COP28), India refrained from signing the ‘Declaration on Climate and Health’.\nStatement 2: The COP28 Declaration on Climate and Health is a binding declaration; and if signed, it becomes mandatory to decarbonize health sector.\nStatement 3: If India’s health sector is decarbonized, the resilience of its health-care system may be compromised.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 2 and Statement 3 are correct and both of them explain Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 2 and Statement 3 are correct but only one of them explains Statement 1"
        },
        {
          "id": "c",
          "text": "Only one of the Statements 2 and 3 is correct and that explains Statement 1"
        },
        {
          "id": "d",
          "text": "Neither Statement 2 nor Statement 3 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 33,
      "question": "Consider the following statements:\nStatement 1: Scientific studies suggest that a shift is taking place in the Earth’s rotation and axis.\nStatement 2: Solar flares and associated coronal mass ejections bombarded the Earth’s outermost atmosphere with tremendous amount of energy.\nStatement 3: As the Earth’s polar ice melts, the water tends to move towards the equator.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 2 and Statement 3 are correct and both of them explain Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 2 and Statement 3 are correct but only one of them explains Statement 1"
        },
        {
          "id": "c",
          "text": "Only one of the Statements 2 and 3 is correct and that explains Statement 1"
        },
        {
          "id": "d",
          "text": "Neither Statement 2 nor Statement 3 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 34,
      "question": "Consider the following statements:\nStatement 1: Article 6 of the Paris Agreement on climate change is frequently discussed in global discussions on sustainable development and climate change.\nStatement 2: Article 6 of the Paris Agreement on climate change sets out the principles of carbon markets.\nStatement 3: Article 6 of the Paris Agreement on climate change intends to promote inter-country non-market strategies to reach their climate targets.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 2 and Statement 3 are correct and both of them explain Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 2 and Statement 3 are correct but only one of them explains Statement 1"
        },
        {
          "id": "c",
          "text": "Only one of the Statements 2 and 3 is correct and that explains Statement 1"
        },
        {
          "id": "d",
          "text": "Neither Statement 2 nor Statement 3 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 35,
      "question": "Which one of the following launched the ‘Nature Solutions Finance Hub for Asia and the Pacific’?",
      "options": [
        {
          "id": "a",
          "text": "The Asian Development Bank (ADB)"
        },
        {
          "id": "b",
          "text": "The Asian Infrastructure Investment Bank (AIIB)"
        },
        {
          "id": "c",
          "text": "The New Development Bank (NDB)"
        },
        {
          "id": "d",
          "text": "The International Bank for Reconstruction and Development (IBRD)"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 36,
      "question": "With reference to ‘Direct Air Capture’, an emerging technology, which of the following statements is/are correct:\nIt can be used as a way of carbon sequestration.\nIt can be a valuable approach for plastic production and in food processing.\nIn aviation, it can be a source of carbon for combining with hydrogen to create synthetic low-carbon fuel.\nSelect the correct answer using the code given below:",
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
          "text": "None of the above statements is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 37,
      "question": "Regarding Peacock tarantula (Gooty tarantula), consider the following statements:\nIt is an omnivorous crustacean.\nIts natural habitat in India is only limited to some forest areas.\nIn its natural habitat, it is an arboreal species.\nWhich of the statements given above is/are correct?",
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
          "text": "2 only"
        },
        {
          "id": "d",
          "text": "2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 38,
      "question": "Consider the following statements:\nCarbon dioxide (CO₂) emissions in India are less than 0.5 t CO₂ per capita.\nIn terms of CO₂ emissions from fuel combustion, India ranks second in Asia-Pacific region.\nElectricity and heat producers are the largest sources of CO₂ emissions in India.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 and 3 only"
        },
        {
          "id": "b",
          "text": "2 only"
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 39,
      "question": "Consider the following pairs:\nPlant\tDescription\n1.\tCassava\tWoody shrub\n2.\tGinger\tHerb with pseudostem\n3.\tMalabar spinach\tHerbaceous climber\n4.\tMint\tAnnual shrub\n5.\tPapaya\tWoody shrub\nHow many of the above pairs are correctly matched?",
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
          "text": "All the five"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 40,
      "question": "With reference to the planet Earth, consider the following statements:\nRain forests produce more oxygen than that produced by oceans.\nMarine phytoplankton and photosynthetic bacteria produce about 50% of the world’s oxygen.\nWell-oxygenated surface water contains several folds higher oxygen than that in atmospheric air.\nWhich of the statements given above is/are correct?",
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
          "text": "None of the above statements is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 41,
      "question": "Consider the following types of vehicles:\nFull battery electric vehicles\nHydrogen fuel cell vehicles\nFuel cell-electric hybrid vehicles\nHow many of the above are considered as alternative powertrain vehicles?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 42,
      "question": "With reference to Unmanned Aerial Vehicles (UAVs), consider the following statements:\nAll types of UAVs can do vertical landing.\nAll types of UAVs can do automated hovering.\nAll types of UAVs can use battery only as a source of power supply.\nHow many of the statements given above are correct?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 43,
      "question": "In the context of electric vehicle batteries, consider the following elements:\nCobalt\nGraphite\nLithium\nNickel\nHow many of the above usually make up battery cathodes?",
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
          "text": "All the four"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 44,
      "question": "Consider the following:\nCigarette butts\nEyeglass lenses\nCar tyres\nHow many of them contain plastic?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 45,
      "question": "Consider the following substances:\nEthanol\nNitroglycerine\nUrea\nCoal gasification technology can be used in the production of how many of them?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 46,
      "question": "CL-20, HMX, and LLM-105 are chemical substances often mentioned in the media. Which of the following best describes their common characteristic?",
      "options": [
        {
          "id": "a",
          "text": "Alternatives to hydrofluorocarbon refrigerants"
        },
        {
          "id": "b",
          "text": "Explosives used in military weapons"
        },
        {
          "id": "c",
          "text": "High-energy fuels for cruise missiles"
        },
        {
          "id": "d",
          "text": "Fuels for rocket propulsion"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 47,
      "question": "Consider the following statements:\nMajorana 1 chip is expected to enable quantum computing.\nMajorana 1 chip has been introduced by Amazon Web Services (AWS).\nDeep learning is a subset of machine learning.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 48,
      "question": "With reference to monoclonal antibodies, which are often mentioned in the news, consider the following statements:\nThey are man-made proteins.\nThey stimulate immunological function due to their ability to bind to specific antigens.\nThey are used in treating viral infections like that of Nipah virus.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 49,
      "question": "Consider the following statements:\nNo virus can survive in ocean waters.\nNo virus can infect bacteria.\nNo virus can change the cellular transcriptional activity in host cells.\nHow many of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 50,
      "question": "Consider the following statements:\nStatement I: Activated carbon is a good and attractive tool to remove pollutants from effluent streams and to remediate contaminants from various industries.\nStatement II: Activated carbon exhibits a large surface area and a strong potential for adsorbing heavy metals.\nStatement III: Activated carbon can be easily synthesized from environmental wastes with high carbon content.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement II and Statement III are correct and both of them explain Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement II and Statement III are correct but only one of them explains Statement I"
        },
        {
          "id": "c",
          "text": "Only one of the Statements II and III is correct and that explains Statement I"
        },
        {
          "id": "d",
          "text": "Neither Statement II nor Statement III is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 51,
      "question": "With reference to the Indian polity, consider the following statements:\nAn Ordinance can amend any Central Act.\nAn Ordinance can abridge a Fundamental Right.\nAn Ordinance can come into effect from a back date.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 52,
      "question": "Consider the following pairs:\nState\tDescription\nI. Arunachal Pradesh\tThe capital is named after a fort, and the State has two National Parks\nII. Nagaland\tThe State came into existence on the basis of a Constitutional Amendment Act\nIII. Tripura\tInitially a Part ‘C’ State, it became a centrally administered territory with the reorganization of States in 1956 and later attained the status of a full-fledged State\nHow many of the above pairs are correctly matched?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 53,
      "question": "With reference to India, consider the following:\nThe Inter-State Council\nThe National Security Council\nZonal Councils\nHow many of the above were established as per the provisions of the Constitution of India?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 54,
      "question": "Consider the following statements:\nThe Constitution of India explicitly mentions that in certain spheres the Governor of a State acts in his/her own discretion.\nThe President of India can, of his/her own, reserve a bill passed by a State Legislature for his/her consideration without it being forwarded by the Governor of the State concerned.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 55,
      "question": "Consider the following pairs:\nProvision in the Constitution of India\tState Under\nI. Separation of Judiciary from the Executive in the public services of the State\tThe Directive Principles of State Policy\nII. Valuing and preserving of the rich heritage of our composite culture\tThe Fundamental Duties\nIII. Prohibition of employment of children below the age of 14 years in factories\tThe Fundamental Rights\nHow many of the above pairs are correctly matched?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 56,
      "question": "Consider the following statements:\nWith reference to the Constitution of India, if an area in a State is declared as a Scheduled Area under the Fifth Schedule:\nThe State Government loses its executive power in such areas and a local body assumes total administration.\nThe Union Government can take over the total administration of such areas under certain circumstances on the recommendations of the Governor.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 57,
      "question": "With reference to the following pairs:\nOrganization\tUnion Ministry\nI. The National Automotive Board\tMinistry of Commerce and Industry\nII. The Coir Board\tMinistry of Heavy Industries\nIII. The National Centre for Trade Information\tMinistry of Micro, Small and Medium Enterprises\nHow many of the above pairs are correctly matched?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 58,
      "question": "Consider the following subjects under the Constitution of India:\nList I – Union List, in the Seventh Schedule\nExtent of the executive power of a State\nConditions of the Governor’s office\nFor a constitutional amendment with respect to which of the above, ratification by the Legislatures of not less than one-half of the States is required before presenting the bill to the President of India for assent?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 59,
      "question": "With reference to the Indian polity, consider the following statements:\nThe Governor of a State is not answerable to any court for the exercise and performance of the powers and duties of his/her office.\nNo criminal proceedings shall be instituted or continued against the Governor during his/her term of office.\nMembers of a State Legislature are not liable to any proceedings in any court in respect of anything said within the House.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 60,
      "question": "Consider the following activities:\nProduction of crude oil\nRefining, storage and distribution of petroleum\nMarketing and sale of petroleum products\nProduction of natural gas\nHow many of the above activities are regulated by the Petroleum and Natural Gas Regulatory Board in India?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 61,
      "question": "Suppose the revenue expenditure is ₹80,000 crores and the revenue receipts of the Government are ₹60,000 crores. The Government budget also shows borrowings of ₹10,000 crores and interest payments of ₹6,000 crores. Which of the following statements are correct?\nRevenue deficit is ₹20,000 crores.\nFiscal deficit is ₹10,000 crores.\nPrimary deficit is ₹4,000 crores.\nSelect the correct answer using the code given below:",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 62,
      "question": "India is one of the founding members of the International North-South Transport Corridor (INSTC), a multimodal transportation corridor, which will connect",
      "options": [
        {
          "id": "a",
          "text": "India to Central Asia to Europe via Iran"
        },
        {
          "id": "b",
          "text": "India to Central Asia via China"
        },
        {
          "id": "c",
          "text": "India to South-East Asia through Bangladesh and Myanmar"
        },
        {
          "id": "d",
          "text": "India to Europe through Azerbaijan"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 63,
      "question": "Consider the following statements:\nStatement I: Of the two major ethanol producers in the world, i.e., Brazil and the United States of America, the former produces more ethanol than the latter.\nStatement II: Unlike in the United States of America where corn is the principal feedstock for ethanol production, sugarcane is the principal feedstock for ethanol production in Brazil.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement I and Statement II are correct and Statement II explains Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement I and Statement II are correct but Statement II does not explain Statement I"
        },
        {
          "id": "c",
          "text": "Statement I is correct but Statement II is not correct"
        },
        {
          "id": "d",
          "text": "Statement I is not correct but Statement II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 64,
      "question": "The World Bank warned that India could become one of the first places where wet-bulb temperatures routinely exceed 35 °C. Which of the following statements best reflect(s) the implication of the above-said report?\nPeninsular India will most likely suffer from flooding, tropical cyclones and droughts.\nThe survival of animals including humans will be affected as shedding of their body heat through perspiration becomes difficult.\nSelect the correct answer using the code given below:",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 65,
      "question": "A country’s fiscal deficit stands at ₹50,000 crores. It is receiving ₹10,000 crores through non-debt creating capital receipts. The country’s interest liabilities are ₹1,500 crores. What is the gross primary deficit?",
      "options": [
        {
          "id": "a",
          "text": "₹48,500 crores"
        },
        {
          "id": "b",
          "text": "₹51,500 crores"
        },
        {
          "id": "c",
          "text": "₹58,500 crores"
        },
        {
          "id": "d",
          "text": "None of the above"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 66,
      "question": "Which of the following statements with regard to recommendations of the 15th Finance Commission of India are correct?\nIt has recommended grants of ₹4,800 crores from the year 2022-23 to the year 2025-26 for incentivizing States to enhance educational outcomes.\n45% of the net proceeds of Union taxes are to be shared with States.\n₹45,000 crores are to be kept as performance-based incentive for all States for carrying out agricultural reforms.\nIt reintroduced tax effort criteria to reward fiscal performance.\nSelect the correct answer using the code given below:",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 67,
      "question": "Consider the following statements in respect of the International Bank for Reconstruction and Development (IBRD):\nIt provides loans and guarantees to middle income countries.\nIt works single-handedly to help developing countries to reduce poverty.\nIt was established to help Europe rebuild after World War II.\nWhich of the statements given above are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 68,
      "question": "Consider the following statements in respect of RTGS and NEFT:\nIn RTGS, the settlement time is instantaneous while in case of NEFT, it takes some time to settle payments.\nIn RTGS, the customer is charged for inward transactions while that is not the case for NEFT.\nOperating hours for RTGS are restricted on certain days while this is not true for NEFT.\nWhich of the statements given above is/are correct?",
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
          "text": "1 and 3"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 69,
      "question": "Consider the following countries:\nUnited Arab Emirates\nFrance\nGermany\nSingapore\nBangladesh\nHow many countries amongst the above, other than India, accept international merchant payments under UPI?",
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
          "text": "All the five"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 70,
      "question": "Consider the following statements about ‘PM Surya Ghar Muft Bijli Yojana’:\nIt targets installation of one crore solar rooftop panels in the residential sector.\nThe Ministry of New and Renewable Energy aims to impart training on installation, operation, maintenance, and repairs of solar rooftop systems at grassroots levels.\nIt aims to create more than three lakh skilled manpower through fresh skilling and upskilling under the scheme component of capacity building.\nWhich of the statements given above are correct?",
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
          "text": "1, 2, and 3"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 71,
      "question": "“Sedition has become my religion” was the famous statement given by Gandhiji at the time of",
      "options": [
        {
          "id": "a",
          "text": "the Champaran Satyagraha"
        },
        {
          "id": "b",
          "text": "publicly violating Salt Law at Dandi"
        },
        {
          "id": "c",
          "text": "attending the Second Round Table Conference in London"
        },
        {
          "id": "d",
          "text": "the launch of the Quit India Movement"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 72,
      "question": "The famous female figurine known as ‘Dancing Girl’, found at Mohenjo-daro, is made of",
      "options": [
        {
          "id": "a",
          "text": "carnelian"
        },
        {
          "id": "b",
          "text": "clay"
        },
        {
          "id": "c",
          "text": "bronze"
        },
        {
          "id": "d",
          "text": "gold"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 73,
      "question": "Who provided legal defence to the people arrested in the aftermath of the Chauri Chaura incident?",
      "options": [
        {
          "id": "a",
          "text": "C. R. Das"
        },
        {
          "id": "b",
          "text": "Madan Mohan Malaviya and Krishna Kant"
        },
        {
          "id": "c",
          "text": "Dr. Saifuddin Kitchlew and Khwaja Hasan Nizami"
        },
        {
          "id": "d",
          "text": "M. A. Jinnah"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 74,
      "question": "Subsequent to which one of the following events did Gandhiji, who consistently opposed untouchability and appealed for its eradication from all spheres, decide to include the upliftment of ‘Harijans’ in his political and social programme?",
      "options": [
        {
          "id": "a",
          "text": "The Poona Pact"
        },
        {
          "id": "b",
          "text": "The Gandhi-Irwin Agreement (Delhi Pact)"
        },
        {
          "id": "c",
          "text": "Arrest of Congress leadership at the time of the Quit India Movement"
        },
        {
          "id": "d",
          "text": "Promulgation of the Government of India Act, 1935"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 75,
      "question": "Consider the following fruits:\nPapaya\nPineapple\nGuava\nHow many of the above were introduced in India by the Portuguese in the sixteenth and seventeenth centuries?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 76,
      "question": "Consider the following countries:\nUnited Kingdom\nDenmark\nNew Zealand\nAustralia\nBrazil\nHow many of the above countries have more than four time zones?",
      "options": [
        {
          "id": "a",
          "text": "All the five"
        },
        {
          "id": "b",
          "text": "Only four"
        },
        {
          "id": "c",
          "text": "Only three"
        },
        {
          "id": "d",
          "text": "Only two"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 77,
      "question": "Consider the following statements:\nAnadyr in Siberia and Nome in Alaska are a few kilometers from each other, but when people are waking up and getting set for breakfast in these cities, it would be different days.\nWhen it is Monday in Anadyr, it is Tuesday in Nome.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "I only"
        },
        {
          "id": "b",
          "text": "II only"
        },
        {
          "id": "c",
          "text": "Both I and II"
        },
        {
          "id": "d",
          "text": "Neither I nor II"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 78,
      "question": "Who among the following was the founder of the ‘Self-Respect Movement’?",
      "options": [
        {
          "id": "a",
          "text": "‘Periyar’ E. V. Ramaswamy Naicker"
        },
        {
          "id": "b",
          "text": "Dr. B. R. Ambedkar"
        },
        {
          "id": "c",
          "text": "Bhaskarrao Jadhav"
        },
        {
          "id": "d",
          "text": "Dinkarrao Javalkar"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 79,
      "question": "Consider the following pairs:\nCountry\tResource-rich in\n1. Botswana\tDiamond\n2. Chile\tLithium\n3. Indonesia\tNickel\nIn how many of the above rows is the given information correctly matched?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 80,
      "question": "Consider the following pairs:\nRegion\tCountry\nI. Mallorca\tItaly\nII. Normandy\tSpain\nIII. Sardinia\tFrance\nIn how many of the above rows is the given information correctly matched?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 81,
      "question": "Consider the following statements:\nStatement I: Some rare earth elements are used in the manufacture of flat television screens and computer monitors.\nStatement II: Some rare earth elements have phosphorescent properties.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement I and Statement II are correct and Statement II explains Statement I"
        },
        {
          "id": "b",
          "text": "Both Statement I and Statement II are correct but Statement II does not explain Statement I"
        },
        {
          "id": "c",
          "text": "Statement I is correct but Statement II is not correct"
        },
        {
          "id": "d",
          "text": "Statement I is not correct but Statement II is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 82,
      "question": "Consider the following statements:\nIndian Railways have prepared a National Rail Plan (NRP) to create a ‘future ready’ railway system by 2028.\n‘Kavach’ is an Automatic Train Protection system developed in collaboration with Germany.\nThe ‘Kavach’ system consists of RFID tags fitted on track in station sections.\nWhich of the statements given above are not correct?",
      "options": [
        {
          "id": "a",
          "text": "I and II only"
        },
        {
          "id": "b",
          "text": "II and III only"
        },
        {
          "id": "c",
          "text": "I and III only"
        },
        {
          "id": "d",
          "text": "I, II and III"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 83,
      "question": "Consider the following space missions:\nAxiom-4\nSpaDeX\nGaganyaan\nHow many of the space missions given above encourage and support microgravity research?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 84,
      "question": "With reference to India’s defence, consider the following pairs:\nAircraft type\tDescription\nI. Dornier-228\tMaritime patrol aircraft\nII. IL-76\tSupersonic combat aircraft\nIII. C-17 Globemaster III\tMilitary transport aircraft\nHow many of the pairs given above are correctly matched?",
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
          "text": "All the three"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 85,
      "question": "Artificial way of causing rainfall to reduce air pollution makes use of",
      "options": [
        {
          "id": "a",
          "text": "silver iodide and potassium iodide"
        },
        {
          "id": "b",
          "text": "silver nitrate and potassium iodide"
        },
        {
          "id": "c",
          "text": "silver iodide and potassium nitrate"
        },
        {
          "id": "d",
          "text": "silver nitrate and potassium chloride"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 86,
      "question": "Consider the following statements with regard to pardoning power of the President of India:\nThe exercise of this power by the President can be subjected to limited judicial review.\nThe President can exercise this power without the advice of the Central Government.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 87,
      "question": "Consider the following statements:\nOn the dissolution of the House of the People, the Speaker shall not vacate his/her office until immediately before the first meeting of the House of the People after the dissolution.\nAccording to the provisions of the Constitution of India, a Member of the House of the People on being elected as Speaker shall resign from his/her political party immediately.\nThe Speaker of the House of the People may be removed from his/her office by a resolution of the House of the People passed by a majority of all the then Members of the House, provided that no resolution shall be moved unless at least fourteen days’ notice has been given of the intention to move the resolution.\nWhich of the statements given above are correct?",
      "options": [
        {
          "id": "a",
          "text": "I and II only"
        },
        {
          "id": "b",
          "text": "II and III only"
        },
        {
          "id": "c",
          "text": "I and III only"
        },
        {
          "id": "d",
          "text": "I, II and III"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 88,
      "question": "Consider the following statements:\nIf any question arises as to whether a Member of the House of the People has become subject to disqualification under the 10th Schedule, the President’s decision in accordance with the opinion of the Council of Union Ministers shall be final.\nThere is no mention of the word ‘political party’ in the Constitution of India.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 89,
      "question": "Consider the following statements:\nStatement 1: In India, State Governments have no power for making rules for grant of concessions in respect of extraction of minor minerals even though such minerals are located in their territories.\nStatement 2: In India, the Central Government has the power to notify minor minerals under the relevant law.\nWhich one of the following is correct in respect of the above statements?",
      "options": [
        {
          "id": "a",
          "text": "Both Statement 1 and Statement 2 are correct and Statement 2 explains Statement 1"
        },
        {
          "id": "b",
          "text": "Both Statement 1 and Statement 2 are correct but Statement 2 does not explain Statement 1"
        },
        {
          "id": "c",
          "text": "Statement 1 is correct but Statement 2 is not correct"
        },
        {
          "id": "d",
          "text": "Statement 1 is not correct but Statement 2 is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 90,
      "question": "Which organization has enacted the Nature Restoration Law (NRL) to tackle climate change and biodiversity loss?",
      "options": [
        {
          "id": "a",
          "text": "The European Union"
        },
        {
          "id": "b",
          "text": "The World Bank"
        },
        {
          "id": "c",
          "text": "The Organization for Economic Cooperation and Development"
        },
        {
          "id": "d",
          "text": "The Food and Agriculture Organization"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 91,
      "question": "Consider the following statements:\nPanchayats at the intermediate level exist in all States.\nTo be eligible to be a Member of a Panchayat at the intermediate level, a person should attain the age of thirty years.\nThe Chief Minister of a State constitutes a commission to review the financial position of Panchayats at the intermediate level and to make recommendations regarding the distribution of net proceeds of taxes and duties, leviable by the State, between the State and Panchayats at the intermediate level.\nWhich of the statements given above are not correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 92,
      "question": "Consider the following statements in respect of BIMSTEC:\nIt is a regional organization consisting of seven member States till January 2025.\nIt came into existence with the signing of the Dhaka Declaration, 1999.\nBangladesh, India, Sri Lanka, Thailand and Nepal are founding member States of BIMSTEC.\nIn BIMSTEC, the subsector of ‘tourism’ is being led by India.\nWhich of the statements given above is/are correct?",
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
          "text": "1 and 4"
        },
        {
          "id": "d",
          "text": "1 only"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 93,
      "question": "Who amongst the following are members of the Jury to select the recipient of ‘Gandhi Peace Prize?\nThe President of India\nThe Prime Minister of India\nThe Chief Justice of India\nThe Leader of Opposition in the Lok Sabha\nSelect the correct answer using the code given below.",
      "options": [
        {
          "id": "a",
          "text": "2 and 4 only"
        },
        {
          "id": "b",
          "text": "1, 2 and 3"
        },
        {
          "id": "c",
          "text": "2, 3 and 4"
        },
        {
          "id": "d",
          "text": "1 and 3 only"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 94,
      "question": "GAGAN (GPS Aided Geo Augmented Navigation) uses a system of ground stations to provide necessary augmentation. Which of the following statements is/are correct in respect of GAGAN?\nIt is designed to provide additional accuracy and integrity.\nIt will allow more uniform and high quality air traffic management.\nIt will provide benefits only in aviation but not in other modes of transportation.\nSelect the correct answer using the code given below.",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
        },
        {
          "id": "b",
          "text": "2 and 3 only"
        },
        {
          "id": "c",
          "text": "1 only"
        },
        {
          "id": "d",
          "text": "1 and 2 only"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 95,
      "question": "Consider the following statements regarding AI Action Summit held in Grand Palaia, Paris in February 2025:\nCo-chaired with India, the event builds on the advances made at the Bletchley Park Summit held in 2023 and the Seoul Summit held in 2024.\nAlong with other countries, US and UK also signed the declaration on inclusive and sustainable AI.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 96,
      "question": "Consider the following pairs:\nInternational Year of the Woman Farmer: 2026\nInternational Year of Sustainable and Resilient Tourism: 2027\nInternational Year of Peace and Trust: 2025\nInternational Year of Asteroid Awareness and Planetary Defence: 2029\nHow many of the pairs given above are correctly matched?",
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
          "text": "All the four"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 97,
      "question": "Consider the following statements with regard to BRICS:\n16th BRICS Summit was held under the Chairship of Russia in Kazan.\nIndonesia has become a full member of BRICS.\nThe theme of the 16th BRICS Summit was Strengthening Multiculturalism for Just Global Development and Security.\nWhich of the statements given above is/are correct?",
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
          "text": "1 and 3"
        },
        {
          "id": "d",
          "text": "1 only"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 98,
      "question": "Consider the following statements about Lokpal:\nThe power of Lokpal applies to public servants of India, but not to the Indian public servants posted outside India.\nThe Chairperson or a Member shall not be a Member of the Parliament or a Member of the Legislature of any State or Union Territory, and only the Chief Justice of India, whether incumbent or retired, has to be its Chairperson.\nThe Chairperson or a Member shall not be a person of less than forty-five years of age on the date of assuming office as the Chairperson or Member, as the case may be.\nLokpal cannot inquire into the allegations of corruption against a sitting Prime Minister of India.\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "3 only"
        },
        {
          "id": "b",
          "text": "2 and 3"
        },
        {
          "id": "c",
          "text": "1 and 4"
        },
        {
          "id": "d",
          "text": "None of the above statements is correct"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 99,
      "question": "Consider the following statements in respect of the first Kho Kho World Cup:\nThe event was held in Delhi, India.\nIndian men beat Nepal with a score of 78-40 in the final to become the World Champion in men category.\nIndian women beat Nepal with a score of 54-36 in the final to become the World Champion in women category.\nWhich of the statements given above is/are correct?",
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
          "text": "1 and 3 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 100,
      "question": "Consider the following statements:\nIn the finals of the 45th Chess Olympiad held in 2024, Gukesh Dommaraju became the world’s youngest winner after defeating the Russian player Ian Nepomniachtchi.\nAbhimanyu Mishra, an American chess player, holds the record of becoming world’s youngest ever Grandmaster.\nWhich of the statements given above is/are correct?",
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
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    }
  ]
};
