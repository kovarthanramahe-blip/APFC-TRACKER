import type { Question, SubjectColorKey } from '../lib/types';

let counter = 0;

function q(
  subject: SubjectColorKey,
  topic: string,
  difficulty: Question['difficulty'],
  question: string,
  options: string[],
  correctIndex: number,
  explanation: string,
  tag: Question['tag'] = 'Practice',
): Question {
  counter += 1;
  const id = `q-${counter}`;
  const opts = options.map((text, i) => ({ id: `${id}-o${i}`, text }));
  return {
    id,
    subject,
    topic,
    tag,
    difficulty,
    question,
    options: opts,
    correctOptionId: opts[correctIndex].id,
    explanation,
  };
}

export const QUESTION_BANK: Question[] = [
  // ---------------- English ----------------
  q('english', 'Synonyms & Antonyms', 'Easy', 'Choose the word most similar in meaning to "Meticulous".', ['Careless', 'Thorough', 'Rapid', 'Generous'], 1, '"Meticulous" means showing great attention to detail; the closest synonym is "Thorough".'),
  q('english', 'Grammar', 'Medium', 'Identify the part of the sentence with an error: "Each of the students / have submitted / their assignment / on time."', ['Each of the students', 'have submitted', 'their assignment', 'on time'], 1, '"Each" is singular, so the verb should be "has submitted".'),
  q('english', 'Idioms & Phrases', 'Easy', 'The idiom "to bite the bullet" means:', ['To eat quickly', 'To face a difficult situation with courage', 'To argue loudly', 'To avoid responsibility'], 1, '"Bite the bullet" means to endure a painful or unpleasant situation bravely.'),
  q('english', 'One Word Substitution', 'Medium', 'A person who can speak many languages is called:', ['Linguist', 'Polyglot', 'Orator', 'Philologist'], 1, 'A "polyglot" is a person who knows and can use several languages.'),
  q('english', 'Cloze Test', 'Medium', 'Fill in the blank: "The committee ______ its decision after a long discussion."', ['announce', 'announced', 'announcing', 'have announced'], 1, 'Simple past tense "announced" fits the completed action described.'),
  q('english', 'Reading Comprehension', 'Medium', 'In comprehension passages, the "central idea" of a passage refers to:', ['A minor detail', 'The main theme the passage conveys overall', 'The last sentence only', 'The author’s name'], 1, 'Central idea = the overall main theme/message of the passage, not an isolated detail.'),
  q('english', 'Voice Change', 'Medium', 'Change to passive voice: "The manager approved the report."', ['The report was approved by the manager.', 'The report approves the manager.', 'The manager is approved by the report.', 'The report had approved the manager.'], 0, 'Passive voice: Object + was/were + past participle + by + subject.'),
  q('english', 'Antonyms', 'Easy', 'Choose the antonym of "Abundant".', ['Plentiful', 'Scarce', 'Huge', 'Numerous'], 1, '"Abundant" means present in large quantity; its opposite is "Scarce".'),
  q('english', 'Para Jumbles', 'Hard', 'In para-jumble questions, the best first strategy is to:', ['Randomly guess the order', 'Identify the sentence introducing the topic/subject', 'Start with the last sentence always', 'Ignore linking words'], 1, 'Find the sentence that introduces the subject/topic — it usually opens the paragraph; then use pronoun and linking-word cues.'),
  q('english', 'Spotting Errors', 'Medium', 'Spot the error: "Neither of the two candidates were selected for the post."', ['Neither of the two candidates', 'were selected', 'for the post', 'No error'], 1, '"Neither...nor / neither of" takes a singular verb: "was selected".'),

  // ---------------- Freedom Struggle ----------------
  q('freedomStruggle', '1857 Revolt', 'Easy', 'The Revolt of 1857 began at:', ['Delhi', 'Meerut', 'Kanpur', 'Lucknow'], 1, 'The revolt began at Meerut on 10 May 1857 and then spread to Delhi and other regions.'),
  q('freedomStruggle', 'INC Formation', 'Easy', 'The Indian National Congress was founded in the year:', ['1857', '1885', '1905', '1920'], 1, 'INC was founded in December 1885 by A.O. Hume along with Indian leaders, with its first session in Bombay.'),
  q('freedomStruggle', 'Partition of Bengal', 'Medium', 'The Partition of Bengal (1905) was carried out by which Viceroy?', ['Lord Curzon', 'Lord Minto', 'Lord Hardinge', 'Lord Ripon'], 0, 'Lord Curzon partitioned Bengal in 1905, triggering the Swadeshi Movement; it was annulled in 1911.'),
  q('freedomStruggle', 'Non-Cooperation Movement', 'Medium', 'The Non-Cooperation Movement was launched by Gandhi in:', ['1917', '1920', '1930', '1942'], 1, 'The Non-Cooperation Movement was launched in 1920 and withdrawn in 1922 after the Chauri Chaura incident.'),
  q('freedomStruggle', 'Civil Disobedience', 'Medium', 'The Salt March (Dandi March) started in which year?', ['1928', '1930', '1932', '1942'], 1, 'Gandhi began the Dandi March on 12 March 1930, starting the Civil Disobedience Movement.'),
  q('freedomStruggle', 'Quit India Movement', 'Easy', 'The Quit India Movement was launched in:', ['1939', '1940', '1942', '1945'], 2, 'The Quit India Movement began on 8 August 1942 with the "Do or Die" call by Gandhi.'),
  q('freedomStruggle', 'INA', 'Medium', 'Who founded the Indian National Army’s (Azad Hind Fauj) later leadership associated with "Jai Hind"?', ['Bhagat Singh', 'Subhas Chandra Bose', 'Chandrashekhar Azad', 'Lala Lajpat Rai'], 1, 'Subhas Chandra Bose led the INA and gave the slogan "Jai Hind".'),
  q('freedomStruggle', 'Constitutional Acts', 'Hard', 'The Government of India Act, 1935 provided for:', ['Complete independence', 'Provincial Autonomy and an All-India Federation (unimplemented)', 'Abolition of Dyarchy at the Centre only', 'Universal adult franchise'], 1, 'The 1935 Act introduced Provincial Autonomy and proposed an All-India Federation that never came into force.'),
  q('freedomStruggle', 'Revolutionaries', 'Medium', 'The Hindustan Socialist Republican Association (HSRA) was associated with:', ['Bhagat Singh and Chandrashekhar Azad', 'Mahatma Gandhi', 'Motilal Nehru', 'Surendranath Banerjee'], 0, 'HSRA (1928) was a revolutionary organisation associated with Bhagat Singh, Chandrashekhar Azad and others.'),
  q('freedomStruggle', 'Partition & Integration', 'Medium', 'The integration of princely states after independence was primarily led by:', ['Jawaharlal Nehru', 'Sardar Vallabhbhai Patel', 'Rajendra Prasad', 'B.R. Ambedkar'], 1, 'Sardar Patel, with V.P. Menon, led the integration of over 560 princely states into the Indian Union.'),

  // ---------------- Current Affairs (evergreen/institutional facts) ----------------
  q('currentAffairs', 'EPFO Basics', 'Easy', 'EPFO stands for:', ['Employees’ Provident Fund Organisation', 'Employment Planning and Finance Office', 'Employee Pension and Fund Office', 'Employees’ Pay and Finance Organisation'], 0, 'EPFO = Employees’ Provident Fund Organisation, under the Ministry of Labour & Employment.'),
  q('currentAffairs', 'Institutions', 'Easy', 'The headquarters of EPFO is located in:', ['Mumbai', 'New Delhi', 'Chennai', 'Kolkata'], 1, 'EPFO’s central/head office is located in New Delhi.'),
  q('currentAffairs', 'Government Schemes', 'Medium', 'The Atal Pension Yojana primarily targets:', ['Organised sector employees only', 'Workers in the unorganised sector', 'Government employees only', 'Foreign nationals'], 1, 'APY is aimed at providing pension coverage to workers in the unorganised sector.'),
  q('currentAffairs', 'International Bodies', 'Medium', 'The International Labour Organization (ILO) is headquartered in:', ['New York', 'Geneva', 'Paris', 'Vienna'], 1, 'ILO, a UN specialized agency, is headquartered in Geneva, Switzerland.'),
  q('currentAffairs', 'Financial Institutions', 'Medium', 'RBI’s Monetary Policy Committee (MPC) primarily decides:', ['Fiscal deficit targets', 'The repo rate and monetary policy stance', 'Income tax slabs', 'Import duties'], 1, 'The MPC sets the policy repo rate to achieve the inflation target.'),
  q('currentAffairs', 'Sports', 'Easy', 'The Olympic Games are held once every:', ['2 years', '3 years', '4 years', '5 years'], 2, 'The Summer and Winter Olympics are each held once every four years.'),
  q('currentAffairs', 'Awards', 'Easy', 'The Bharat Ratna is India’s:', ['Highest military award', 'Highest civilian award', 'Highest sporting award', 'Highest literary award'], 1, 'Bharat Ratna is the highest civilian award of India.'),
  q('currentAffairs', 'Indices', 'Medium', 'The Human Development Index (HDI) is released by:', ['World Bank', 'UNDP', 'IMF', 'WHO'], 1, 'HDI is published by the United Nations Development Programme (UNDP).'),
  q('currentAffairs', 'Digital India', 'Easy', 'UMANG app is primarily used for:', ['Online shopping', 'Accessing pan-India e-governance services including EPFO', 'Booking railway tickets only', 'Social networking'], 1, 'UMANG (Unified Mobile Application for New-age Governance) provides access to many government services, including EPFO services.'),
  q('currentAffairs', 'National Institutions', 'Medium', 'NITI Aayog replaced which earlier body?', ['Finance Commission', 'Planning Commission', 'Election Commission', 'Law Commission'], 1, 'NITI Aayog replaced the Planning Commission in 2015.'),

  // ---------------- General Science ----------------
  q('science', 'Physics', 'Easy', 'The SI unit of electric current is:', ['Volt', 'Ampere', 'Ohm', 'Watt'], 1, 'The ampere (A) is the SI base unit of electric current.'),
  q('science', 'Chemistry', 'Easy', 'The chemical symbol for Sodium is:', ['So', 'Sd', 'Na', 'S'], 2, 'Sodium’s symbol "Na" comes from its Latin name "Natrium".'),
  q('science', 'Biology', 'Medium', 'The human heart has how many chambers?', ['2', '3', '4', '5'], 2, 'The human heart has four chambers: two atria and two ventricles.'),
  q('science', 'Nutrition', 'Medium', 'Vitamin C deficiency causes which disease?', ['Rickets', 'Scurvy', 'Beriberi', 'Night blindness'], 1, 'Deficiency of Vitamin C (ascorbic acid) causes scurvy.'),
  q('science', 'Physics', 'Medium', 'Which law states that "for every action there is an equal and opposite reaction"?', ['Newton’s First Law', 'Newton’s Second Law', 'Newton’s Third Law', 'Law of Conservation of Energy'], 2, 'This is Newton’s Third Law of Motion.'),
  q('science', 'Environment', 'Medium', 'The layer of the atmosphere that protects Earth from harmful UV rays is the:', ['Troposphere', 'Ozone layer (Stratosphere)', 'Mesosphere', 'Ionosphere'], 1, 'The ozone layer, located in the stratosphere, absorbs most of the sun’s harmful UV radiation.'),
  q('science', 'Biology', 'Easy', 'Photosynthesis mainly occurs in the plant part containing:', ['Chlorophyll', 'Xylem', 'Phloem', 'Root hair'], 0, 'Chlorophyll, present in chloroplasts, captures light energy for photosynthesis.'),
  q('science', 'Chemistry', 'Medium', 'The pH value of pure water at room temperature is approximately:', ['0', '5', '7', '14'], 2, 'Pure water is neutral with a pH of approximately 7.'),
  q('science', 'Inventions', 'Easy', 'The telephone was invented by:', ['Thomas Edison', 'Alexander Graham Bell', 'Nikola Tesla', 'James Watt'], 1, 'Alexander Graham Bell is credited with inventing the practical telephone.'),
  q('science', 'Physics', 'Medium', 'Sound cannot travel through:', ['Solids', 'Liquids', 'Gases', 'Vacuum'], 3, 'Sound is a mechanical wave and requires a medium; it cannot travel through vacuum.'),

  // ---------------- Polity ----------------
  q('polity', 'Constitution Basics', 'Easy', 'The Indian Constitution was adopted on:', ['15 August 1947', '26 January 1950', '26 November 1949', '2 October 1950'], 2, 'The Constituent Assembly adopted the Constitution on 26 November 1949; it came into force on 26 January 1950.'),
  q('polity', 'Fundamental Rights', 'Medium', 'The Right to Constitutional Remedies is provided under which Article?', ['Article 19', 'Article 21', 'Article 32', 'Article 14'], 2, 'Article 32 empowers citizens to move the Supreme Court for enforcement of Fundamental Rights; Dr. Ambedkar called it the "heart and soul" of the Constitution.'),
  q('polity', 'DPSP', 'Medium', 'Directive Principles of State Policy are contained in which Part of the Constitution?', ['Part III', 'Part IV', 'Part V', 'Part VI'], 1, 'DPSPs are enumerated in Part IV (Articles 36-51) of the Constitution.'),
  q('polity', 'Union Executive', 'Easy', 'The President of India is elected by:', ['Direct public vote', 'An Electoral College of MPs and MLAs', 'The Prime Minister', 'The Supreme Court'], 1, 'The President is elected by an Electoral College comprising elected members of Parliament and State Legislative Assemblies.'),
  q('polity', 'Parliament', 'Medium', 'A Money Bill can be introduced only in:', ['Rajya Sabha', 'Lok Sabha', 'Either House', 'State Legislature'], 1, 'As per Article 110, a Money Bill can be introduced only in the Lok Sabha.'),
  q('polity', 'Amendments', 'Hard', 'Which amendment added the Fundamental Duties to the Constitution?', ['24th', '42nd', '44th', '52nd'], 1, 'The 42nd Amendment (1976) added Fundamental Duties (Article 51A) based on the Swaran Singh Committee recommendations.'),
  q('polity', 'Panchayati Raj', 'Medium', 'The 73rd Constitutional Amendment relates to:', ['Urban local bodies', 'Panchayati Raj Institutions', 'Judicial reforms', 'Anti-defection law'], 1, 'The 73rd Amendment (1992) gave constitutional status to Panchayati Raj Institutions.'),
  q('polity', 'Judiciary', 'Medium', 'Judicial Review in India means:', ['Parliament can review court judgments', 'Courts can examine the constitutional validity of laws', 'The President can veto laws', 'States can override central laws'], 1, 'Judicial review empowers courts to examine and invalidate laws/executive actions inconsistent with the Constitution.'),
  q('polity', 'Constitutional Bodies', 'Medium', 'The Comptroller and Auditor General (CAG) of India is appointed by:', ['The Prime Minister', 'The President', 'The Chief Justice of India', 'Parliament by vote'], 1, 'The CAG is appointed by the President of India under Article 148.'),
  q('polity', 'Emergency Provisions', 'Hard', 'National Emergency under the Constitution is provided for in:', ['Article 352', 'Article 356', 'Article 360', 'Article 368'], 0, 'Article 352 deals with National Emergency due to war, external aggression, or armed rebellion.'),

  // ---------------- Economy ----------------
  q('economy', 'Basic Concepts', 'Easy', 'GDP stands for:', ['Gross Domestic Product', 'General Development Plan', 'Gross Development Percentage', 'Government Debt Policy'], 0, 'GDP (Gross Domestic Product) measures the total value of goods and services produced within a country.'),
  q('economy', 'RBI', 'Medium', 'The repo rate is the rate at which:', ['RBI lends short-term funds to commercial banks', 'Commercial banks lend to RBI', 'Banks lend to each other', 'The government borrows from the public'], 0, 'Repo rate is the rate at which RBI lends money to commercial banks against securities.'),
  q('economy', 'Planning', 'Medium', 'NITI Aayog was established in the year:', ['2014', '2015', '2016', '2017'], 1, 'NITI Aayog was established on 1 January 2015, replacing the Planning Commission.'),
  q('economy', 'Taxation', 'Medium', 'GST in India is a:', ['Direct tax', 'Destination-based indirect tax', 'Wealth tax', 'Capital gains tax'], 1, 'GST is a destination-based indirect tax levied on the supply of goods and services.'),
  q('economy', 'Economic Reforms', 'Medium', 'The LPG economic reforms of 1991 stand for:', ['Liberalisation, Privatisation, Globalisation', 'Loans, Policy, Growth', 'Land, Production, Government', 'Labour, Pension, GDP'], 0, 'LPG reforms of 1991 refer to Liberalisation, Privatisation and Globalisation.'),
  q('economy', 'Banking', 'Medium', 'Which is the central bank of India?', ['SBI', 'NABARD', 'Reserve Bank of India', 'IDBI'], 2, 'The Reserve Bank of India (RBI), established in 1935, is India’s central bank.'),
  q('economy', 'Inflation', 'Medium', 'Inflation refers to:', ['A fall in general price levels', 'A sustained rise in general price levels', 'An increase in exports only', 'A decrease in money supply'], 1, 'Inflation is a sustained increase in the general price level of goods and services.'),
  q('economy', 'Fiscal Policy', 'Medium', 'Fiscal deficit refers to:', ['Total revenue minus total expenditure', 'Total expenditure minus total receipts excluding borrowings', 'Trade deficit', 'Current account deficit'], 1, 'Fiscal deficit = total expenditure - total receipts (excluding borrowings), indicating the government’s total borrowing requirement.'),
  q('economy', 'Agriculture', 'Easy', 'The "Green Revolution" in India is primarily associated with increase in production of:', ['Pulses', 'Foodgrains (especially wheat & rice)', 'Cotton', 'Sugarcane'], 1, 'The Green Revolution (1960s) significantly boosted foodgrain production, especially wheat and rice.'),
  q('economy', 'External Sector', 'Medium', 'Balance of Payments records a country’s transactions with:', ['Its own citizens only', 'Rest of the world', 'State governments', 'Central bank only'], 1, 'BoP is a systematic record of all economic transactions between a country and the rest of the world.'),

  // ---------------- History & Culture ----------------
  q('historyCulture', 'Indus Valley', 'Easy', 'The Indus Valley Civilization site of Mohenjo-daro is located in present-day:', ['India', 'Pakistan', 'Afghanistan', 'Bangladesh'], 1, 'Mohenjo-daro is located in Sindh, Pakistan.'),
  q('historyCulture', 'Vedic Age', 'Medium', 'The Rigveda is primarily a collection of:', ['Stories', 'Hymns dedicated to deities', 'Legal codes', 'Administrative records'], 1, 'The Rigveda consists of hymns dedicated to various deities and is the oldest of the four Vedas.'),
  q('historyCulture', 'Buddhism', 'Medium', 'Gautam Buddha attained enlightenment at:', ['Lumbini', 'Bodh Gaya', 'Sarnath', 'Kushinagar'], 1, 'Buddha attained enlightenment under the Bodhi tree at Bodh Gaya.'),
  q('historyCulture', 'Mauryan Empire', 'Medium', 'Emperor Ashoka embraced Buddhism after which war?', ['Battle of Panipat', 'Kalinga War', 'Battle of Kannauj', 'Battle of Hydaspes'], 1, 'Ashoka embraced Buddhism after witnessing the devastation of the Kalinga War (261 BCE).'),
  q('historyCulture', 'Delhi Sultanate', 'Medium', 'The Delhi Sultanate was founded by:', ['Qutb-ud-din Aibak', 'Iltutmish', 'Balban', 'Alauddin Khilji'], 0, 'Qutb-ud-din Aibak founded the Delhi Sultanate (Slave/Mamluk dynasty) in 1206 CE.'),
  q('historyCulture', 'Mughal Empire', 'Easy', 'The Mughal Empire in India was founded by:', ['Akbar', 'Humayun', 'Babur', 'Shah Jahan'], 2, 'Babur founded the Mughal Empire after defeating Ibrahim Lodi at the First Battle of Panipat (1526).'),
  q('historyCulture', 'Architecture', 'Easy', 'The Taj Mahal was built by which Mughal emperor?', ['Akbar', 'Jahangir', 'Shah Jahan', 'Aurangzeb'], 2, 'Shah Jahan built the Taj Mahal in memory of his wife Mumtaz Mahal.'),
  q('historyCulture', 'Classical Dance', 'Medium', 'Bharatanatyam classical dance form originated in:', ['Kerala', 'Tamil Nadu', 'Odisha', 'Assam'], 1, 'Bharatanatyam is a classical dance form that originated in Tamil Nadu.'),
  q('historyCulture', 'Gupta Period', 'Hard', 'The Gupta period is often referred to as the "Golden Age" of India mainly due to advances in:', ['Military conquest only', 'Art, literature, science and mathematics', 'Foreign trade only', 'Agriculture only'], 1, 'The Gupta period saw major achievements in art, literature, mathematics (including the concept of zero) and science.'),
  q('historyCulture', 'Heritage', 'Medium', 'Which of these is a UNESCO World Heritage Site in India?', ['Hawa Mahal', 'Khajuraho Group of Monuments', 'Gateway of India', 'India Gate'], 1, 'The Khajuraho Group of Monuments is a UNESCO World Heritage Site known for its temple architecture and sculptures.'),

  // ---------------- Accounting ----------------
  q('accounting', 'Basic Concepts', 'Easy', 'The accounting equation is:', ['Assets = Liabilities - Capital', 'Assets = Liabilities + Capital', 'Capital = Assets + Liabilities', 'Liabilities = Assets + Capital'], 1, 'The fundamental accounting equation: Assets = Liabilities + Capital (Owner’s Equity).'),
  q('accounting', 'Journal & Ledger', 'Medium', 'The process of transferring journal entries to the ledger is called:', ['Posting', 'Casting', 'Balancing', 'Vouching'], 0, '"Posting" refers to transferring entries from the journal to the respective ledger accounts.'),
  q('accounting', 'Trial Balance', 'Medium', 'A Trial Balance is prepared to check:', ['Profitability of the business', 'Arithmetical accuracy of ledger accounts', 'Cash flow position', 'Tax liability'], 1, 'A Trial Balance checks the arithmetical accuracy of the ledger by matching debit and credit totals.'),
  q('accounting', 'Depreciation', 'Medium', 'Under the Straight Line Method, depreciation charged each year is:', ['Variable', 'Constant', 'Increasing', 'Based on market value'], 1, 'Under SLM, an equal (constant) amount of depreciation is charged each year over the asset’s useful life.'),
  q('accounting', 'BRS', 'Medium', 'A Bank Reconciliation Statement is prepared to reconcile differences between:', ['Cash book and Trading account', 'Cash book balance and Pass book balance', 'Balance sheet and P&L account', 'Trial balance and ledger'], 1, 'BRS reconciles the balance as per the cash book with the balance as per the bank passbook/statement.'),
  q('accounting', 'Final Accounts', 'Medium', 'Closing stock is normally shown on which side of the Trading Account?', ['Debit side', 'Credit side', 'Not shown at all', 'Both sides'], 1, 'Closing stock is shown on the credit side of the Trading Account and as an asset in the Balance Sheet.'),
  q('accounting', 'Expenditure', 'Medium', 'Purchase of a new machine for the factory is an example of:', ['Revenue expenditure', 'Capital expenditure', 'Deferred revenue expenditure', 'Contingent liability'], 1, 'Buying a fixed asset like machinery is capital expenditure, as it provides long-term benefit.'),
  q('accounting', 'Cost Accounting', 'Medium', 'Fixed costs are costs that:', ['Vary directly with output', 'Remain constant irrespective of output level (within a range)', 'Are always zero', 'Only occur once a year'], 1, 'Fixed costs remain unchanged regardless of the level of production, within a relevant range.'),
  q('accounting', 'Ratios', 'Hard', 'The Current Ratio is calculated as:', ['Current Assets / Current Liabilities', 'Current Liabilities / Current Assets', 'Net Profit / Sales', 'Fixed Assets / Current Assets'], 0, 'Current Ratio = Current Assets ÷ Current Liabilities; it measures short-term liquidity.'),
  q('accounting', 'Basic Concepts', 'Easy', 'The "Going Concern" concept assumes that a business will:', ['Close within a year', 'Continue to operate for the foreseeable future', 'Be sold immediately', 'Never earn profit'], 1, 'The Going Concern concept assumes the business will continue operations indefinitely unless there is evidence otherwise.'),

  // ---------------- Labour Law ----------------
  q('labourLaw', 'EPF Act', 'Easy', 'The Employees’ Provident Funds and Miscellaneous Provisions Act was enacted in:', ['1948', '1952', '1965', '1972'], 1, 'The EPF & MP Act was enacted in 1952 to provide provident fund benefits to employees.'),
  q('labourLaw', 'ESI Act', 'Medium', 'The Employees’ State Insurance Act, 1948 primarily provides:', ['Retirement pension only', 'Medical and cash benefits during sickness, maternity, and employment injury', 'Housing loans', 'Educational scholarships'], 1, 'ESI Act provides medical care and cash benefits to employees in case of sickness, maternity and employment injury.'),
  q('labourLaw', 'Industrial Disputes', 'Medium', 'The Industrial Disputes Act, 1947 mainly deals with:', ['Minimum wage fixation', 'Investigation and settlement of industrial disputes', 'Company registration', 'Income tax on industries'], 1, 'This Act provides machinery for investigation and settlement of industrial disputes.'),
  q('labourLaw', 'Factories Act', 'Medium', 'The Factories Act, 1948 applies to premises employing how many or more workers (using power)?', ['5', '10', '20', '50'], 1, 'The Factories Act generally applies to premises with 10 or more workers where power is used (20 or more without power).'),
  q('labourLaw', 'Gratuity', 'Medium', 'Under the Payment of Gratuity Act, 1972, gratuity is generally payable after continuous service of:', ['1 year', '3 years', '5 years', '10 years'], 2, 'An employee is generally eligible for gratuity after rendering continuous service of 5 years.'),
  q('labourLaw', 'Bonus Act', 'Medium', 'The Payment of Bonus Act, 1965 applies to establishments employing:', ['5 or more persons', '10 or more persons', '20 or more persons', '100 or more persons'], 2, 'The Act generally applies to factories and establishments employing 20 or more persons.'),
  q('labourLaw', 'Trade Unions', 'Medium', 'The Trade Unions Act was enacted in the year:', ['1926', '1936', '1947', '1948'], 0, 'The Trade Unions Act, 1926 provides for registration and protection of trade unions in India.'),
  q('labourLaw', 'Maternity Benefit', 'Medium', 'As per the Maternity Benefit (Amendment) Act, 2017, paid maternity leave was increased to:', ['12 weeks', '18 weeks', '26 weeks', '30 weeks'], 2, 'The 2017 amendment increased paid maternity leave from 12 to 26 weeks for the first two children.'),
  q('labourLaw', 'Labour Codes', 'Hard', 'The four labour codes that consolidate central labour laws include the Code on Wages and the:', ['Code on Social Security', 'Code on Taxation', 'Code on Education', 'Code on Environment'], 0, 'The four labour codes are: Code on Wages, Industrial Relations Code, Code on Social Security, and OSH Code.'),
  q('labourLaw', 'Minimum Wages', 'Medium', 'The Minimum Wages Act, 1948 empowers governments to:', ['Fix maximum working hours only', 'Fix minimum rates of wages for scheduled employments', 'Abolish trade unions', 'Set export duties'], 1, 'The Act empowers appropriate governments to fix minimum wage rates for employments listed in its schedule.'),

  // ---------------- Computer ----------------
  q('computer', 'Fundamentals', 'Easy', 'CPU stands for:', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Processing Unit'], 0, 'CPU = Central Processing Unit, the primary component that executes instructions.'),
  q('computer', 'Software', 'Easy', 'An operating system is an example of:', ['Application software', 'System software', 'Hardware', 'Firmware only'], 1, 'An operating system is system software that manages hardware and provides services for application programs.'),
  q('computer', 'MS Office', 'Easy', 'In MS Excel, a collection of cells is called a:', ['Sheet', 'Range', 'Table', 'Grid'], 1, 'A group/collection of selected cells in Excel is referred to as a "range".'),
  q('computer', 'Internet', 'Medium', 'WWW stands for:', ['World Wide Web', 'World Wide Wire', 'Web Wide World', 'Wide World Web'], 0, 'WWW = World Wide Web, an information system on the Internet.'),
  q('computer', 'Networking', 'Medium', 'A device that connects multiple networks and routes data between them is called a:', ['Modem', 'Router', 'Switch', 'Hub'], 1, 'A router forwards data packets between different computer networks.'),
  q('computer', 'Cyber Security', 'Medium', 'Malicious software designed to damage or disrupt a computer system is called:', ['Firmware', 'Malware', 'Middleware', 'Freeware'], 1, '"Malware" is the general term for malicious software including viruses, worms, and trojans.'),
  q('computer', 'Storage', 'Easy', 'Which of these is a volatile memory?', ['Hard Disk', 'RAM', 'ROM', 'Pen Drive'], 1, 'RAM (Random Access Memory) is volatile — it loses data when power is switched off.'),
  q('computer', 'Digital India', 'Medium', 'DigiLocker is primarily used for:', ['Online payments', 'Storing and accessing digital versions of official documents', 'Video conferencing', 'Social media'], 1, 'DigiLocker allows citizens to store and access authenticated digital documents/certificates.'),
  q('computer', 'Email', 'Easy', 'The "@" symbol in an email address separates:', ['Domain name and country code', 'Username and domain name', 'Subject and body', 'Sender and receiver name'], 1, 'The "@" symbol separates the username from the domain name in an email address.'),
  q('computer', 'MS Word', 'Easy', 'The default file extension for a Microsoft Word document (modern versions) is:', ['.txt', '.docx', '.xlsx', '.pptx'], 1, 'Modern MS Word documents are saved with the ".docx" extension.'),

  // ---------------- Quant ----------------
  q('quant', 'Percentage', 'Easy', 'What is 25% of 480?', ['100', '110', '120', '130'], 2, '25% of 480 = 480 × 25/100 = 120.'),
  q('quant', 'Profit & Loss', 'Medium', 'A shopkeeper buys an item for ₹800 and sells it for ₹1000. What is the profit percentage?', ['20%', '25%', '30%', '15%'], 1, 'Profit = 200; Profit% = (200/800) × 100 = 25%.'),
  q('quant', 'Simple Interest', 'Medium', 'Find the Simple Interest on ₹5000 at 8% per annum for 3 years.', ['₹1000', '₹1100', '₹1200', '₹1400'], 2, 'SI = (P × R × T)/100 = (5000 × 8 × 3)/100 = ₹1200.'),
  q('quant', 'Ratio & Proportion', 'Medium', 'Divide ₹1200 between A and B in the ratio 3:5. What is B’s share?', ['₹450', '₹600', '₹750', '₹800'], 2, 'Total parts = 8; B’s share = (5/8) × 1200 = ₹750.'),
  q('quant', 'Time & Work', 'Medium', 'A can complete a work in 10 days and B in 15 days. Working together, how many days will they take?', ['5 days', '6 days', '7 days', '8 days'], 1, 'Combined rate = 1/10 + 1/15 = 1/6, so together they take 6 days.'),
  q('quant', 'Time, Speed & Distance', 'Medium', 'A train travels 300 km in 5 hours. What is its speed?', ['50 km/h', '60 km/h', '70 km/h', '80 km/h'], 1, 'Speed = Distance/Time = 300/5 = 60 km/h.'),
  q('quant', 'Average', 'Easy', 'Find the average of 12, 18, 24, and 30.', ['20', '21', '22', '23'], 1, 'Average = (12+18+24+30)/4 = 84/4 = 21.'),
  q('quant', 'Number System', 'Medium', 'What is the smallest prime number?', ['0', '1', '2', '3'], 2, '2 is the smallest and only even prime number.'),
  q('quant', 'Compound Interest', 'Hard', 'Find the Compound Interest on ₹10,000 for 2 years at 10% p.a. (compounded annually).', ['₹1,900', '₹2,000', '₹2,100', '₹2,200'], 2, 'Amount = 10000(1.1)^2 = 12100; CI = 12100 - 10000 = ₹2,100.'),
  q('quant', 'Mensuration', 'Medium', 'Find the area of a rectangle with length 12 cm and breadth 7 cm.', ['70 cm²', '84 cm²', '90 cm²', '96 cm²'], 1, 'Area of rectangle = length × breadth = 12 × 7 = 84 cm².'),
  q('quant', 'Data Interpretation', 'Medium', 'If a pie chart sector represents 90° out of 360°, what percentage of the total does it represent?', ['15%', '20%', '25%', '30%'], 2, '90/360 × 100 = 25%.'),

  // ---------------- Reasoning ----------------
  q('reasoning', 'Series', 'Easy', 'Find the next number in the series: 2, 4, 8, 16, ?', ['24', '28', '30', '32'], 3, 'Each term is double the previous term: 16 × 2 = 32.'),
  q('reasoning', 'Coding-Decoding', 'Medium', 'If CAT is coded as DBU, how is DOG coded using the same logic?', ['EPH', 'EPI', 'FPH', 'EQH'], 0, 'Each letter is shifted forward by 1: D→E, O→P, G→H, giving EPH.'),
  q('reasoning', 'Blood Relations', 'Medium', 'Pointing to a man, a woman says, "His mother is the only daughter of my mother." How is the woman related to the man?', ['Sister', 'Mother', 'Aunt', 'Grandmother'], 1, '"Only daughter of my mother" = the woman herself; so the man’s mother is the woman, making her his mother.'),
  q('reasoning', 'Direction Sense', 'Medium', 'A man walks 5 km North, then turns right and walks 3 km. Which direction is he facing now?', ['North', 'South', 'East', 'West'], 2, 'Turning right while facing North means he now faces East.'),
  q('reasoning', 'Analogy', 'Easy', 'Book is to Library as Patient is to:', ['Doctor', 'Hospital', 'Medicine', 'Nurse'], 1, 'A Book is stored/found in a Library, just as a Patient is found/treated in a Hospital.'),
  q('reasoning', 'Classification', 'Easy', 'Find the odd one out: Apple, Mango, Potato, Banana', ['Apple', 'Mango', 'Potato', 'Banana'], 2, 'Potato is a vegetable; the rest are fruits.'),
  q('reasoning', 'Syllogism', 'Hard', 'Statements: All pens are pencils. All pencils are erasers. Conclusion: All pens are erasers.', ['True', 'False', 'Cannot be determined', 'Partially true'], 0, 'Since all pens are pencils, and all pencils are erasers, it logically follows that all pens are erasers.'),
  q('reasoning', 'Calendar', 'Medium', 'If 1 January 2024 was a Monday, what day was 8 January 2024?', ['Sunday', 'Monday', 'Tuesday', 'Wednesday'], 1, '8 January is exactly 7 days after 1 January, so it falls on the same day: Monday.'),
  q('reasoning', 'Series', 'Medium', 'Find the missing term: AZ, BY, CX, ?', ['DW', 'DV', 'EW', 'DX'], 0, 'First letters go A,B,C,D (forward); second letters go Z,Y,X,W (backward), giving DW.'),
  q('reasoning', 'Non-Verbal', 'Medium', 'In a mirror image of the number "35", how does it appear (mirror placed vertically to the right)?', ['35 reversed left-right with digits mirrored', '53 unchanged', '35 unchanged', 'None of the above'], 0, 'A vertical mirror reverses the image left-to-right, flipping both the order and shape of the digits.'),

  // ---------------- Labour Movement / Social Security ----------------
  q('labourMovement', 'EPFO History', 'Easy', 'EPFO was established under which year’s Act/Ordinance?', ['1948', '1952', '1965', '1971'], 1, 'EPFO was set up following the promulgation of the EPF Ordinance in 1951, culminating in the EPF Act, 1952.'),
  q('labourMovement', 'EPS-95', 'Medium', 'The Employees’ Pension Scheme (EPS) was introduced in the year:', ['1990', '1995', '2000', '2004'], 1, 'The Employees’ Pension Scheme, 1995 (EPS-95) provides pension benefits to EPF members.'),
  q('labourMovement', 'EDLI', 'Medium', 'EDLI stands for:', ['Employees’ Deposit Linked Insurance', 'Employees’ Disability & Life Insurance', 'Employer Direct Linked Investment', 'Employees’ Death & Loss Indemnity'], 0, 'EDLI = Employees’ Deposit Linked Insurance Scheme, providing life insurance benefit to EPF members’ families.'),
  q('labourMovement', 'UAN', 'Easy', 'UAN in the context of EPFO stands for:', ['Universal Account Number', 'Unique Aadhaar Number', 'Union Account Number', 'Universal Application Number'], 0, 'UAN (Universal Account Number) links all PF accounts of a member across employers.'),
  q('labourMovement', 'ILO', 'Medium', 'India became a founding member of the ILO in:', ['1919', '1945', '1950', '1926'], 0, 'India has been a founding member of the ILO since its establishment in 1919.'),
  q('labourMovement', 'Social Security Schemes', 'Medium', 'Pradhan Mantri Shram Yogi Maandhan (PM-SYM) is a scheme for:', ['Pension for unorganised sector workers', 'Health insurance for government employees', 'Housing for urban poor', 'Skill training for youth'], 0, 'PM-SYM provides a monthly pension to unorganised sector workers after the age of 60.'),
  q('labourMovement', 'Trade Union History', 'Medium', 'The first organised trade union in India, the Madras Labour Union, was formed in:', ['1908', '1918', '1926', '1935'], 1, 'The Madras Labour Union, considered India’s first organised trade union, was formed in 1918.'),
  q('labourMovement', 'AITUC', 'Medium', 'The All India Trade Union Congress (AITUC) was founded in:', ['1920', '1925', '1930', '1935'], 0, 'AITUC, India’s oldest trade union federation, was founded in 1920 with Lala Lajpat Rai as its first president.'),
  q('labourMovement', 'Social Security Code', 'Hard', 'The Code on Social Security, 2020 consolidates and subsumes laws including the EPF Act and:', ['The Companies Act', 'The Maternity Benefit Act and ESI Act', 'The Income Tax Act', 'The Consumer Protection Act'], 1, 'The Social Security Code, 2020 subsumes several laws including EPF Act, ESI Act, Maternity Benefit Act, and Payment of Gratuity Act among others.'),
  q('labourMovement', 'NPS', 'Medium', 'The National Pension System (NPS) is regulated by:', ['SEBI', 'IRDAI', 'PFRDA', 'RBI'], 2, 'NPS is regulated by the Pension Fund Regulatory and Development Authority (PFRDA).'),
];

export function getQuestionsBySubject(subject: string) {
  return QUESTION_BANK.filter((q) => q.subject === subject);
}
