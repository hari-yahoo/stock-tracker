{\rtf1\ansi\ansicpg1252\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww20440\viewh11420\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 You are an expert Technical Product Manager and Software Architect. I need you to generate a detailed Product Requirements Document (PRD) in Markdown format for a personal web application called "Stock Tracker". \
\
Please use the following context, requirements, and constraints to build the document.\
\
---\
\
### Project Overview & Context\
- **Product Name:** Stock Tracker\
- **Target Audience:** Single-user (Personal use for the creator).\
- **Deployment:** Hosted locally on a MacBook.\
- **Key Problem to Solve:** The user manages investments across multiple trading accounts and lacks a consolidated view. Crucially, they buy stocks with a specific target exit date and price in mind, but often lose track of this original strategy over time. They need a system that enforces accountability to their original plan and provides semi-automated AI insights.\
\
### Tech Stack Constraints\
- **Frontend/Backend:** React + NestJS\
- **Database:** SQLite or similar - to keep it lightweight and easy to run on a Mac.\
- **Security/Auth:** No authentication required (accessible only via localhost).\
\
---\
\
### Required PRD Sections\
\
Please generate the PRD with the following explicit sections:\
\
#### 1. Executive Summary & Goals\
- High-level vision of the app.\
- Core objectives (Consolidation, Plan Accountability, AI Prompt Generation).\
\
#### 2. User Personas & Scope\
- Explicitly state the single-user, local-host scope. \
- Define what is *Out of Scope* (e.g., multi-tenancy, cloud deployment, live brokerage API integrations, automated trading).\
\
#### 3. Functional Requirements (User Features)\
Break this down into detailed user stories or feature specs:\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\sl264\slmult1\pardirnatural\partightenfactor0
\cf0 - **Multi-Account Dashboard:** Ability to add/edit/delete trading accounts and view a consolidated portfolio balance, total profit/loss, and asset allocation.\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 - **Stock Inventory Management:** CRUD operations for stock transactions (Ticker, Buy Price, Quantity, Date, Trading Account).\
- **Strategy & Exit Tracker (Crucial Feature):** - Every stock purchase must optionally link to an "Exit Plan" containing: *Target Exit Price*, *Target Exit Date*, and a *Notes/Rationale* field.\
    - A visual warning or alert system on the dashboard when a stock approaches/passes its exit date, or hits its target price.\
    - A historical log of "Closed Positions" comparing actual exit vs. planned exit.\
- **AI Prompt Generator Engine:** - A dedicated section that aggregates current portfolio data (tickers, average buy prices, current allocations, and original exit plans).\
    - A "Generate AI Prompt" button that compiles this data into a structured, well-engineered prompt. \
    - The user can copy this prompt to paste into external AI tools (like ChatGPT or Claude) to receive periodic portfolio reviews and strategic suggestions.\
\
#### 4. Non-Functional Requirements\
- **Performance:** Fast local loading times.\
- **Data Persistence:** How the file-based system should handle simultaneous reads/writes safely.\
- **Portability:** Easy to move or back up the database file on macOS.\
\
#### 5. Data Model / Schema Design\
- Propose a relational schema structure for:\
    - `Accounts`\
    - `Stocks/Transactions`\
    - `ExitPlans`\
\
#### 6. Key Wireframes / UI Layout Ideas\
- Describe the layout for:\
    - The Main Consolidated Dashboard.\
    - The Stock Entry Form (highlighting the Exit Strategy fields).\
    - The AI Prompt Generation Workspace.\
    - Transaction details of a stock\
\
---\
\
Please ensure the tone is professional, organized, and technical enough for a developer to immediately start scaffolding the Nest.js project based on your output.}