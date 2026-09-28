import type { UpscCsePrelimsPyqBatchFile } from '../lib/upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims 2026, GS Paper I, Questions 51-100 — a pre-processed batch prepared externally
// (outside this app; see the 'source' field below) and supplied by the user for integration. Every
// question/option field below is transcribed VERBATIM from that supplied batch — programmatically
// converted from the original JSON to this TypeScript literal to guarantee byte-for-byte fidelity
// (no manual retyping of 50 questions' worth of text). Never re-parsed from the original source
// text, never re-fetched, and never edited by hand — see lib/upscCsePrelimsPyqBatchImport.ts for
// what VALIDATEs and RESOLVEs this raw batch into data/pyqUpscCsePrelims.ts's actual destination
// records. correctOptionId is null throughout: the supplied batch carries no answer key. Unlike the
// Q1-50 batch, subject/microsyllabusHint are null on every question here too (this batch's own
// preparation step did not classify them) — every one of these 50 questions is necessarily
// needs_review, never guessed at from question content.
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100: UpscCsePrelimsPyqBatchFile = {
  "schema": "upsc-cse-prelims-user-supplied-pyq-batch",
  "schemaVersion": 1,
  "exam": "UPSC CSE",
  "stage": "prelims",
  "paper": "GS Paper I",
  "year": 2026,
  "questionRange": [
    51,
    100
  ],
  "source": {
    "kind": "user_provided_text",
    "filename": "Pasted markdown(6).md",
    "answerKeyProvided": false,
    "verificationStatus": "provisional"
  },
  "questions": [
    {
      "questionNumber": 51,
      "question": "Mr. X, a senior officer, was overseeing a critical vaccination programme during a pandemic. He found that a private service provider responsible for vaccine distribution was compromising on quality to make profits. Despite immense pressure to manage the issue due to vested interests, he raised his voice based on the principles of public administration which he learnt during various training programmes attended across his career. He reported the issue to the appropriate vigilance authority and halted the contract to ensure citizen welfare.\n\nWhich one among the following principles of public administration was most strongly demonstrated by Mr. X’s actions?",
      "options": [
        {
          "id": "a",
          "text": "Esprit de corps"
        },
        {
          "id": "b",
          "text": "Equity"
        },
        {
          "id": "c",
          "text": "Accountability"
        },
        {
          "id": "d",
          "text": "Delegation"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 52,
      "question": "In a multi-ethnic district where both economic competition and historical grievances frequently led to community tensions, a flashpoint has arisen with a Government decision to allocate land for a waste management facility near a tribal hamlet, sparking protests by the tribal community, which claimed that the land was sacred and critical to their cultural identity. At the same time, urban residents and local industries supported the project, citing severe solid waste challenges and health concerns due to lack of a proper disposal site. The conflict has escalated with road blockades, social media campaigns, and allegations of police excesses. As a responsible Government official, you are tasked with resolving the situation through mediation, ensuring a sustainable outcome that balances environmental needs, tribal rights, and urban public health.\n\nConsider the following statements with reference to the above:\n\n1. A successful conflict resolution process must begin with acknowledging the cultural concerns of the protesting tribal community before discussing technical alternatives.\n2. The Government should move ahead with the project without delay to address urban health concerns, which outweigh the sentiments of a small group.\n3. Creating a multi-stakeholder dialogue platform- including tribal leaders, environmental experts, and municipal representatives – to build mutual understanding and help de-escalate tensions.\n4. Conducting an independent Environmental and Social Impact Assessment (ESIA) and sharing findings transparently with both sides to facilitate evidence-based decision-making.\n\nWhich of the statements given above would contribute to the resolution process?",
      "options": [
        {
          "id": "a",
          "text": "1, 3 and 4 only"
        },
        {
          "id": "b",
          "text": "2, 3 and 4 only"
        },
        {
          "id": "c",
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1, 2, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": null,
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 53,
      "question": "Ms. X is a mid-level civil service official working in the urban development department of a major city. Recently, she was involved in approving a contract for a public infrastructure project a new community park. During the approval process, she received a piece of confidential information indicating that one of the shortlisted contractors had a history of poor workmanship and allegations of corruption in other cities, though nothing had been legally proven. The Head of the Department, Mr. Y, advised her not to disclose this information to the project committee or the public because it could delay the project and damage the city’s reputation. However, Ms. X believed that withholding such information compromised transparency and public trust.\n\nWhat amongst the following should Ms. X do now?\n\n1. Immediately disclose the information to the project committee and the public\n2. Recommend removing the contractor from the shortlist to protect the project’s integrity\n3. Propose a ‘limited disclosure’ to an oversight committee, while keeping the information confidential from the public for the time being",
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
      "questionNumber": 54,
      "question": "X was addressing a seminar on the meaning of the term ‘law’ as provided under Article 13, Part III of the Constitution of India. X explained that the meaning of the term ‘law’ in the Constitution of India was very comprehensive. It included ordinances, orders and even rules and regulations. Y pointed out that the term ‘law’ in Article 13 also included custom or usage having in the territory of India the force of law, to which X was not convinced.\n\nBased on the above, select the correct conclusion from the options given below:",
      "options": [
        {
          "id": "a",
          "text": "X is correct in the interpretation of law, including the view on non-inclusion of custom."
        },
        {
          "id": "b",
          "text": "The view of Y that ‘law’ included custom is not correct."
        },
        {
          "id": "c",
          "text": "The views of both ‘X’ and ‘Y’ are correct."
        },
        {
          "id": "d",
          "text": "The view of only ‘Y’ is correct."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 55,
      "question": "Consider the following statements with reference to the Constitution of India:\n\n1. There is no Article in the Constitution of India that specifies that the Constitution of India will be officially called the ‘Constitution of India’.\n2. There is no Article in the Constitution of India that specifies that the Indian Independence Act, 1947 and the Government of India Act, 1935 stand repealed.\n3. There is no Article in the Constitution of India that mentions 26th January, 1950 as the date of the commencement of the Constitution of India.\n\nWhich one of the following conclusions based on the above statements is correct?",
      "options": [
        {
          "id": "a",
          "text": "All three statements are correct."
        },
        {
          "id": "b",
          "text": "There is no correct statement."
        },
        {
          "id": "c",
          "text": "There are two correct statements that include statement 3."
        },
        {
          "id": "d",
          "text": "There is only one correct statement."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Constitution",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 56,
      "question": "Which of the following statements with regard to the persons with disabilities in India is/are correct?\n\n1. The Rights of Persons with Disabilities Act, an Act passed by the Parliament of India in 2016, mandates reservation in education and employment, places a legal duty on Governments to ensure accessibility and non-discrimination.\n2. The Sugamya Bharat Abhiyan focuses on achieving universal accessibility for Persons with Disabilities across three key domains built infrastructure, transport systems and information and communication technology.\n3. The National Divyangjan Finance and Development Corporation (NDFDC) is a public sector organisation set up by the Ministry of Corporate Affairs as a not-for-profit company to promote entrepreneurship among Persons with Disabilities (PwDs).",
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
          "text": "1 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Rights Issues",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 57,
      "question": "Consider the following statements about the provisions pertaining to the Scheduled Castes and the Scheduled Tribes in India:\n\n1. Provisions regarding the administration of the Tribal Areas in the States of Assam, Meghalaya, Tripura and Mizoram are given in the Fifth Schedule of the Constitution of India.\n2. Some tribes of India are entitled to exemption from paying Income Tax on certain incomes.\n3. The Constitution of India provides for reservation of seats in Panchayats for women belonging to the Scheduled Castes and the Scheduled Tribes.\n\nWhich one of the following conclusions based on the above statements is correct?",
      "options": [
        {
          "id": "a",
          "text": "There are two correct statements, that include statement 2."
        },
        {
          "id": "b",
          "text": "There are two correct statements, that are statements 1 and 3."
        },
        {
          "id": "c",
          "text": "There is only one correct statement."
        },
        {
          "id": "d",
          "text": "All three statements are correct."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Rights Issues",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 58,
      "question": "Consider the following statements in respect of questions asked by the Members in the Parliament of India:\n\n1. Unstarred questions are those to which a Member desires an oral answer in the House.\n2. Starred questions are those to which a Member desires a written answer.\n3. No supplementary question can be asked on an unstarred question.\n\nWhich one of the following conclusions based on the above statements is correct?",
      "options": [
        {
          "id": "a",
          "text": "All the three statements are correct."
        },
        {
          "id": "b",
          "text": "There are two correct statements, that include statement 2."
        },
        {
          "id": "c",
          "text": "There is only one correct statement."
        },
        {
          "id": "d",
          "text": "There is no correct statement."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 59,
      "question": "Consider the following statements about the Committee on the Welfare of Scheduled Castes and Scheduled Tribes of the Parliament of India:\n\n1. Although members of this Committee are elected from both Houses of Parliament, the Chairperson of this Committee is appointed by the Chairman of the Rajya Sabha.\n2. Twenty members are elected by the Rajya Sabha and ten members by the Lok Sabha.\n3. No Minister, except for the Union Minister of Social Justice and Empowerment, is eligible to be a member of this Committee.\n4. Members are elected for a fixed term of two years from the date they enter their office.\n\nWhich one of the following conclusions based on the above statements is correct?",
      "options": [
        {
          "id": "a",
          "text": "There are four correct statements."
        },
        {
          "id": "b",
          "text": "There is only one correct statement, that is statement 2."
        },
        {
          "id": "c",
          "text": "There are two correct statements, that include statement 1."
        },
        {
          "id": "d",
          "text": "There is no correct statement."
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 60,
      "question": "Consider the following statements about Mission Sudarshan Chakra of India:\n\n1. It aims to enhance India’s air defence, ballistic missile defence and aerial offensive capabilities.\n2. This Mission is being designed to enhance rapid, precise, and powerful defence responses, reinforcing India’s strategic autonomy.\n3. One of the aims of this Mission is to cover all public places of India by an expanded nationwide security shield by 2035.\n\nWhich of the statements given above is/are correct?",
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
          "text": "1 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 61,
      "question": "Consider the following statements about river bridges connecting India with neighbouring countries:\n\n1. ‘Maitri Setu’, built over Feni river, connects Ramgarh in India with Sabroom in Bangladesh.\n2. Jhulaghat suspension bridge connects India with Myanmar.\n3. Mechi bridge and its approaches connect Panitanki Bypass in India with Kakarvitta in Nepal.\n\nWhich of the statements given above is/are correct?",
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
          "text": "1 only"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 62,
      "question": "Which of the following statements about a Zero First Information Report (Zero FIR) under the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 is/are correct?\n\n1. A Zero FIR can be lodged at a police station, even though the place of commission of a cognizable/non-cognizable offence is outside the territorial jurisdiction of that police station.\n2. The Officer-in-Charge of the police station where a Zero FIR has been lodged may, with the permission of the competent authority, initiate a preliminary enquiry.\n3. Under Zero FIR, it is obligatory for the informant to furnish information electronically.",
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
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Rights Issues",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 63,
      "question": "With reference to the organisations under the Government of India, consider the following details:\n\n| Sl. No. | Organisation                            | Function                                                                    | Controlling Union Ministry                        |\n| :---------- | :------------------------------------------ | :------------------------------------------------------------------------------ | :---------------------------------------------------- |\n| 1.      | Central Economic Intelligence Bureau (CEIB) | To coordinate between various law enforcement agencies                          | Ministry of Home Affairs                              |\n| 2.      | Serious Fraud Investigation Office (SFIO)   | To investigate complex corporate frauds                                         | Ministry of Finance                                   |\n| 3.      | Central Bureau of Investigation (CBI)       | To preserve values in public life and ensure the health of the national economy | Ministry of Personnel, Public Grievances and Pensions |\n\nIn how many of the above rows are the given details correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "1"
        },
        {
          "id": "b",
          "text": "2"
        },
        {
          "id": "c",
          "text": "3"
        },
        {
          "id": "d",
          "text": "None"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Political System",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 64,
      "question": "Which of the following international conventions have not been ratified by India?\n\n1. Employment Policy Convention\n2. Abolition of Forced Labour Convention\n3. International Convention on the Protection of the Rights of All Migrant Workers and Members of Their Families\n4. Geneva Convention Relative to the Protection of Civilian Persons in Time of War\n5. Convention on Reduction of Statelessness",
      "options": [
        {
          "id": "a",
          "text": "2 and 4"
        },
        {
          "id": "b",
          "text": "1 and 2"
        },
        {
          "id": "c",
          "text": "3 and 4"
        },
        {
          "id": "d",
          "text": "3, 4 and 5"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 65,
      "question": "Consider the following statements with respect to the AI Impact Summit, 2026 held in New Delhi:\n\n1. The Summit’s intellectual framework was structured around three foundational Sutras: People, Planning, and Progress.\n2. The Preamble of the Summit stresses the Charter for Democratising AI Resources, which acknowledges Democratic Diffusion of AI as a binding framework to support locally relevant innovation ecosystems and strengthen resilient AI while respecting national laws.\n3. The New Delhi Declaration on AI Impact was structured around seven Chakras for Social Empowerment, AI for Science, and Secure and Trusted AI.\n\nWhich of the statements given above is/are correct?",
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
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 66,
      "question": "Which of the following connectivity projects is/are a part of cooperation between India and the ASEAN member countries?\n\n1. Kaladan Multi-Modal Transit Transport Project\n2. IMT Trilateral Highway\n3. Agartala-Akhaura Rail Line",
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
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 67,
      "question": "Match List I with List II and select the answer using the code given below the Lists:\n\n| List I (Country) | List II (Project Supported by India)             |\n| :------------------- | :--------------------------------------------------- |\n| A. Maldives      | 1. Mangdechhu Hydroelectric Project                  |\n| B. Afghanistan   | 2. Restoration of Stor Palace                        |\n| C. Bhutan        | 3. District Hospital at Dickoya                      |\n| D. Sri Lanka     | 4. Institute of Security and Law Enforcement Studies |",
      "options": [
        {
          "id": "a",
          "text": "A-1, B-4, C-2, D-3"
        },
        {
          "id": "b",
          "text": "A-3, B-2, C-4, D-1"
        },
        {
          "id": "c",
          "text": "A-3, B-4, C-2, D-1"
        },
        {
          "id": "d",
          "text": "A-1, B-2, C-4, D-3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 68,
      "question": "Which of the following items of defence hardware is/are manufactured in India?\n\n1. Su-30 MKI Fighter Jets\n2. T-90 MK-III Tanks\n3. Akula Class Submarine",
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
          "text": "1 only"
        },
        {
          "id": "d",
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 69,
      "question": "Consider the following statements about platforms for multilateral co-operation:\n\n1. The ‘Colombo Process’ is a regional consultative process in which member states take binding decisions by consensus.\n2. The ‘Abu Dhabi Dialogue’ is a voluntary non-binding consultative process among Asian countries of labour origin and destination to facilitate regional cooperation on contractual labour mobility.\n3. The ‘Global Forum for Migration and Development’, created upon the proposal of a former UN Secretary General, is a voluntary forum whose decisions are non-binding in nature.\n\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
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
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 70,
      "question": "Consider the following UN organisations/agencies:\n\n1. World Food Programme\n2. United Nations Children’s Fund\n3. United Nations High Commissioner for Refugees\n4. International Labour Organisation\n\nHow many of the above has/have been awarded the Nobel Prize twice?",
      "options": [
        {
          "id": "a",
          "text": "1"
        },
        {
          "id": "b",
          "text": "2"
        },
        {
          "id": "c",
          "text": "3"
        },
        {
          "id": "d",
          "text": "4"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 71,
      "question": "Match List I with List II and select the answer using the code given below the Lists:\n\n| List I (UN Peacekeeping Operation) | List II (Period of Operation) |\n| :------------------------------------- | :-------------------------------- |\n| A. UNMIL                           | 1. 2007-2010                      |\n| B. MINURCAT                        | 2. 2002-2005                      |\n| C. MINUSTAH                        | 3. 2003-2018                      |\n| D. UNMISET                         | 4. 2004-2017                      |",
      "options": [
        {
          "id": "a",
          "text": "A-3, B-4, C-1, D-2"
        },
        {
          "id": "b",
          "text": "A-3, B-1, C-4, D-2"
        },
        {
          "id": "c",
          "text": "A-2, B-1, C-4, D-3"
        },
        {
          "id": "d",
          "text": "A-2, B-4, C-1, D-3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 72,
      "question": "Match List I with List II and select the answer using the code given below the Lists:\n\n| List I (BIMSTEC Centre/Establishment)      | List II (Location) |\n| :--------------------------------------------- | :--------------------- |\n| A. BIMSTEC Cultural Industries Observatory | 1. NOIDA               |\n| B. BIMSTEC Energy Centre                   | 2. Bengaluru           |\n| C. BIMSTEC Centre for Weather and Climate  | 3. Colombo             |\n| D. BIMSTEC Technology Transfer Facility    | 4. Thimphu             |",
      "options": [
        {
          "id": "a",
          "text": "A-3, B-2, C-1, D-4"
        },
        {
          "id": "b",
          "text": "A-3, B-1, C-2, D-4"
        },
        {
          "id": "c",
          "text": "A-4, B-2, C-1, D-3"
        },
        {
          "id": "d",
          "text": "A-4, B-1, C-2, D-3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 73,
      "question": "Which one of the following pairs is not correctly matched?\n\n| Indian Army Corps | Headquarters |\n| :-------------------- | :--------------- |",
      "options": [
        {
          "id": "a",
          "text": "3 Corps       | Dimapur"
        },
        {
          "id": "b",
          "text": "4 Corps       | Tezpur"
        },
        {
          "id": "c",
          "text": "14 Corps      | Leh"
        },
        {
          "id": "d",
          "text": "33 Corps      | Srinagar"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 74,
      "question": "Which of the following statements with respect to the Revamped Rashtriya Gram Swaraj Abhiyan (RGSA) is/are correct?\n\n1. The period of its implementation is 1st April, 2021 to 31st March, 2026.\n2. The key objective of the Revamped RGSA is to develop the governance capabilities of the Panchayati Raj Institutions to deliver on the Sustainable Development Goals.\n3. The share of the Central funding for the Revamped RGSA is 100% for all States and Union Territories.",
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
          "text": "2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Indian Polity & Governance",
      "microsyllabusHint": "Panchayati Raj",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 75,
      "question": "Which of the following countries are members of the European Union?\n\n1. Belarus\n2. Poland\n3. Germany\n4. Switzerland",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 4"
        },
        {
          "id": "b",
          "text": "1 and 4 only"
        },
        {
          "id": "c",
          "text": "2 and 3"
        },
        {
          "id": "d",
          "text": "2 and 4 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 76,
      "question": "Match List I with List II and select the answer using the code given below the Lists:\n\n| List I (INTERPOL Notice) | List II (Description)                                                                                                           |\n| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |\n| A. Silver Notice         | 1. To seek information on unidentified bodies                                                                                       |\n| B. Blue Notice           | 2. To collect additional information about a person’s identity, location, or activities in relation to a criminal investigation     |\n| C. Black Notice          | 3. To provide warning about a person’s criminal activities, where the person is to be considered a possible threat to public safety |\n| D. Green Notice          | 4. To identify and trace criminal assets                                                                                            |",
      "options": [
        {
          "id": "a",
          "text": "A-3, B-1, C-2, D-4"
        },
        {
          "id": "b",
          "text": "A-3, B-2, C-1, D-4"
        },
        {
          "id": "c",
          "text": "A-4, B-2, C-1, D-3"
        },
        {
          "id": "d",
          "text": "A-4, B-1, C-2, D-3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 77,
      "question": "Which of the following statements in relation to NIRANTAR (National Institute for Research and Application of Natural Resources to Transform, Adapt and Build Resilience), a platform of institutions under the Ministry of Environment, Forest and Climate Change, is/are correct?\n\n1. Ecosystem Survey and Analysis is a vertical under this platform, the lead institute of which is Botanical Survey of India, Kolkata.\n2. Research and Management of Ecosystem Service is a vertical under this platform, the lead institute of which is Central Zoo Authority, New Delhi.\n3. Capacity Development Support is a vertical under this platform, the lead institute of which is Indian Institute of Forest Management, Bhopal.\n:",
      "options": [
        {
          "id": "a",
          "text": "1, 2 and 3"
        },
        {
          "id": "b",
          "text": "1 and 3 only"
        },
        {
          "id": "c",
          "text": "2 only"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Environment & Ecology",
      "microsyllabusHint": "Environmental Ecology",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 78,
      "question": "The Chancellor of the Federal Republic of Germany visited India in January, 2026. Which of the following is/are not correct in terms of outcomes of this visit?\n\n1. Signing of Memorandum of Understanding between the All India Institute of Ayurveda and the University of Hamburg\n2. Signing of Memorandum of Understanding on Youth Hockey Development between Hockey India and the German Hockey Federation\n3. Establishment of a bilateral dialogue mechanism on the Indo-Pacific\n4. Opening of an Honorary Consul of Germany in Lucknow\n:",
      "options": [
        {
          "id": "a",
          "text": "2 and 3"
        },
        {
          "id": "b",
          "text": "1 and 4"
        },
        {
          "id": "c",
          "text": "3 and 4"
        },
        {
          "id": "d",
          "text": "1 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 79,
      "question": "Which of the following statements about DHRUV64 is/are correct?\n\n1. It is the third chip fabricated under the DIR-V Programme with an overall aim to enable the creation of microprocessors for India.\n2. It is India’s first homegrown 1.0 GHz, 64-bit dual-core microprocessor.",
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
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 80,
      "question": "The Bureau of Indian Standard (BIS) recently introduced a national standard to test and assess bomb disposal system. Which of the following statements with regard to this system is/are correct?\n\n1. The new standard is known as IS 19445: 2025.\n2. It will improve interoperability of equipment across agencies.\n3. It was developed by TBRL, DRDO in collaboration with the 30th Central Scientific Research Institute, Russia.\n:",
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
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 81,
      "question": "X”, born in the UK, was conferred the Nobel Prize in 2025. He was a professor in an American university when this prize was announced. Identify ‘X’:",
      "options": [
        {
          "id": "a",
          "text": "Michel H. Devoret"
        },
        {
          "id": "b",
          "text": "Richard Robson"
        },
        {
          "id": "c",
          "text": "John Clarke"
        },
        {
          "id": "d",
          "text": "Joel Mokyr"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 82,
      "question": "Which of the following statements with regard to India’s indigenous new high resolution weather model, the ‘Bharat Forecast System,’ is/are correct?\n\n1. Its objective is to generate forecasts at the Panchayats cluster level.\n2. It was developed by IIT Delhi.",
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
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 83,
      "question": "Which one of the following pairs of semiconductor plants in India and their locations is not correctly matched?",
      "options": [
        {
          "id": "a",
          "text": "CG Power and Industrial Solutions Pvt. Ltd. in partnership with Renesas Electronics and STARS Microelectronics : Gujarat"
        },
        {
          "id": "b",
          "text": "Tata Semiconductor Assembly and Test Pvt. Ltd. : Assam"
        },
        {
          "id": "c",
          "text": "HCL-Foxconn Joint Venture India Chip Ltd. : Madhya Pradesh"
        },
        {
          "id": "d",
          "text": "SicSem Pvt. Ltd. : Odisha"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 84,
      "question": "Which of the following statements with regard to the Grand Slam Tennis Tournaments is/are correct?\n\n1. The tournaments have a shared governance structure establishing the partnership among the four Grand Slam tournaments.\n2. They are open for entry to all internationally ranked tennis players above the age of 14.\n3. There is a limitation on the number of ‘Wild Cards’ a player may receive to compete in a Grand Slam Tournament.\n:",
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
          "text": "1 only"
        },
        {
          "id": "d",
          "text": "1, 2 and 3"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "International Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 85,
      "question": "Consider the following statements with regard to the film ‘Boong’:\n\n1. The film has recently won the British Academy of Film and Television Arts (BAFTA) Award in the Children’s and Family Film category.\n2. The film is directed by Lakshmipriya Devi.\n3. This is the first Indian film to win a BAFTA award in the Children’s and Family Film category.\n\nWhich of the statements given above is/are correct?",
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
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Current Affairs",
      "microsyllabusHint": "National Current Affairs",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 86,
      "question": "Which of the following statements regarding the features of blockchain technology are correct?\n\n1. Records stored in the database may be made visible to relevant stakeholders without risk of alteration.\n2. Copies of the entire database are stored on multiple computers on a network, syncing within seconds.\n3. Consortium blockchain is a blend of public and private blockchains allowing selective data access.\n4. Mathematical algorithms make it impossible to change or delete any data once recorded and accepted.",
      "options": [
        {
          "id": "a",
          "text": "1 and 3"
        },
        {
          "id": "b",
          "text": "2 and 4 only"
        },
        {
          "id": "c",
          "text": "1, 2 and 4"
        },
        {
          "id": "d",
          "text": "1 and 4 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 87,
      "question": "An e-commerce revenue model where the seller has control over pricing but doesn’t keep products in stock and instead transfers customer orders and shipment details to a third-party supplier, who then ships the goods directly to the customer, is called:",
      "options": [
        {
          "id": "a",
          "text": "Dropshipping Model"
        },
        {
          "id": "b",
          "text": "Affiliate Revenue Model"
        },
        {
          "id": "c",
          "text": "Transaction Fee Revenue Model"
        },
        {
          "id": "d",
          "text": "Agency Revenue Model"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 88,
      "question": "Which one of the following correctly represents the three key sub-indices of the Financial Inclusion Index (FI-Index) of the Reserve Bank of India (RBI)?",
      "options": [
        {
          "id": "a",
          "text": "Credit access, Insurance depth, and Pension coverage"
        },
        {
          "id": "b",
          "text": "Banking access, GDP contribution, and Financial literacy"
        },
        {
          "id": "c",
          "text": "Access, Usage, and Quality"
        },
        {
          "id": "d",
          "text": "Access, Affordability, and Transparency"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Poverty & Inclusion",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 89,
      "question": "Which one of the following best describes the key objective of India’s ‘Open Network for Digital Commerce’ (ONDC) initiative ?",
      "options": [
        {
          "id": "a",
          "text": "To allow government control over all digital commerce transactions"
        },
        {
          "id": "b",
          "text": "To replace private e-commerce players"
        },
        {
          "id": "c",
          "text": "To break the dominance of large e-commerce platforms by enabling interoperability across networks"
        },
        {
          "id": "d",
          "text": "To mandate UPI-based payments for all online transactions"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 90,
      "question": "Which one of the following statements about Unified Payments Interface (UPI) and Central Bank Digital Currency (Digital Rupee) is not correct?",
      "options": [
        {
          "id": "a",
          "text": "UPI is a real-time payment system but Digital Rupee is akin to sovereign paper currency."
        },
        {
          "id": "b",
          "text": "In case of UPI, settlement for end users happens instantly as the money gets immediately debited or credited but in case of Digital Rupee, there is no settlement as the wallet balance gets transferred to another wallet."
        },
        {
          "id": "c",
          "text": "UPI transactions are recorded by banks and reflected in bank statements but in case of Digital Rupee, no data is captured in bank statements as transactions are from one wallet to another."
        },
        {
          "id": "d",
          "text": "In both the cases (UPI and Digital Rupee), the liability lies with the users and their respective banks."
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 91,
      "question": "Which of the following statements about Real-World Assets (RWA) Tokenization are correct?\n\n1. Tokenization is the process of turning real world assets into digital tokens using blockchain technology.\n2. Tokenization of real world assets offers 24×7 access, promoting financial inclusion.\n3. Tokenization of real world assets will allow the access to high growth investment opportunities for individuals in India.\n:",
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
          "text": "1 and 2 only"
        },
        {
          "id": "d",
          "text": "1 and 3 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Science & Technology",
      "microsyllabusHint": "Science & Technology in Everyday Life",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 92,
      "question": "A bond whose proceeds are used only to finance or refinance a combination of both environmental and social projects is called:",
      "options": [
        {
          "id": "a",
          "text": "Green Bond"
        },
        {
          "id": "b",
          "text": "Social Bond"
        },
        {
          "id": "c",
          "text": "Sustainability Bond"
        },
        {
          "id": "d",
          "text": "Sovereign Bond"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Sustainable Development",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 93,
      "question": "Which of the following statements about M1xchange’s role in Micro, Small & Medium Enterprises (MSMEs) financing is/are correct?\n\n1. M1xchange provides collateral based loans to MSMEs.\n2. M1xchange facilitates discounting of invoices and Bills of Exchange for MSMEs.\n3. M1xchange functions as a credit rating agency for MSMEs.",
      "options": [
        {
          "id": "a",
          "text": "1 and 3 only"
        },
        {
          "id": "b",
          "text": "3 only"
        },
        {
          "id": "c",
          "text": "2 only"
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
      "questionNumber": 94,
      "question": "Which one of the following best describes the ‘Crowding Out Effect’ in the context of fiscal policy?",
      "options": [
        {
          "id": "a",
          "text": "A situation where private investment increases due to increased Government spending"
        },
        {
          "id": "b",
          "text": "A situation where Government borrowing leads to higher interest rates, which reduces private investment"
        },
        {
          "id": "c",
          "text": "A situation where an increase in taxes leads to increased private investment"
        },
        {
          "id": "d",
          "text": "A situation where Government spending has no impact on aggregate demand"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 95,
      "question": "Which of the following statements about Rare Earth Elements (REEs) and Critical Minerals is/are correct?\n\n1. Modern technological innovations including Artificial Intelligence, robotics and space exploration extensively utilise Rare Earth Elements (REEs).\n2. China has the highest share in mining of REEs followed by India.\n3. The Government of India launched the National Critical Mineral Mission (NCMM) in 2025 to establish a robust framework for self-reliance in the critical mineral sector.\n4. Rare Earth Elements are a set of 13 metallic elements.\n:",
      "options": [
        {
          "id": "a",
          "text": "1 and 3 only"
        },
        {
          "id": "b",
          "text": "1, 2 and 3"
        },
        {
          "id": "c",
          "text": "1, 3 and 4"
        },
        {
          "id": "d",
          "text": "1, 2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Sustainable Development",
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 96,
      "question": "Which of the following statements about insurance in aviation sector is/are correct?\n\n1. ‘Aviation Hull Insurance’ covers the physical aircraft, including the body, engine, and on-board equipment.\n2. Under the Montreal Convention, adopted in 1999 by over 130 countries, including India, airlines are strictly liable to pay compensation to the family/nominee of every deceased passenger without requiring the family to prove fault.",
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
      "questionNumber": 97,
      "question": "Which of the following statements about Crowdfunding is/are correct?\n\n1. Crowdfunding is solicitation of funds (small amount) from multiple investors through a web-based platform or social networking site for a specific project.\n2. Small and Medium Enterprises (SMEs) are able to raise funds at lower cost of capital without undergoing rigorous procedures.",
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
      "questionNumber": 98,
      "question": "With reference to different Committees in India, consider the following details:\n\n| Sl. No. | Committee            | Objective                                                            | Organization under which it was formed              |\n| :---------- | :----------------------- | :----------------------------------------------------------------------- | :------------------------------------------------------ |\n| 1.      | R.N. Malhotra Committee  | Comprehensive reforms of Insurance sector in India                       | Insurance Regulatory and Development Authority of India |\n| 2.      | L.C. Gupta Committee     | Preparing a roadmap for the introduction of derivatives trading in India | Securities and Exchange Board of India                  |\n| 3.      | Urjit R. Patel Committee | Preparing a roadmap for reforming bank lending to the Housing sector     | Reserve Bank of India                                   |\n| 4.      | Y.H. Malegam Committee   | Preparing a roadmap for reforms in Microfinance sector in India          | Reserve Bank of India                                   |\n\nIn which of the above rows are all the details correctly matched ?",
      "options": [
        {
          "id": "a",
          "text": "2 only"
        },
        {
          "id": "b",
          "text": "2 and 3"
        },
        {
          "id": "c",
          "text": "1, 3 and 4"
        },
        {
          "id": "d",
          "text": "2 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 99,
      "question": "Consider the following statements about the Non-Banking Financial Companies (NBFCs) in India:\n\n1. NBFCs cannot accept demand deposits.\n2. All the NBFCs operating in India have to be registered with the RBI.\n3. NBFCs form part of the payment and settlement system and can issue cheque drawn on itself.\n4. Deposit insurance facility of Deposit Insurance and Credit Guarantee Corporation (DICGC) is not available to the depositors of deposit taking NBFCs.\n\nWhich of the statements given above is/are correct?",
      "options": [
        {
          "id": "a",
          "text": "1 and 4"
        },
        {
          "id": "b",
          "text": "1, 2 and 3"
        },
        {
          "id": "c",
          "text": "4 only"
        },
        {
          "id": "d",
          "text": "2, 3 and 4"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": null,
      "mappingStatus": "review_required"
    },
    {
      "questionNumber": 100,
      "question": "Consider the following statements about Multidimensional Poverty Index (MPI):\n\n1. MPI is calculated using Alkire-Foster methodology.\n2. MPI calculated by NITI Aayog has a total of twelve indicators.\n3. Maternal Health and Bank Account are common indicators in the MPI of NITI Aayog and MPI of United Nations Development Programme (UNDP).\n\nWhich of the statements given above is/are correct?",
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
          "text": "2 only"
        }
      ],
      "correctOptionId": null,
      "subject": "Economic & Social Development",
      "microsyllabusHint": "Poverty & Inclusion",
      "mappingStatus": "review_required"
    }
  ]
};
