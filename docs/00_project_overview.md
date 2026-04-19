# Project Overview

## Goal
Build a collaborative web tool for Park Systems to manage:
- Installation Passdown Report
- Field Service Passdown Report

## Tech Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase (DB + Realtime + Storage)
- Vercel

## Core Structure
- Dashboard
- Cards

## Card Definition
A card represents a report workspace for:
- Specific Site
- Specific Equipment

Cards are separated by:
- Installation
- Field Service

## Document Definition
A document is:
- A date-based report entry inside a card
- Stores report content and history

## Key Rules
- Only one user can edit a card at a time
- Other users are read-only
- Internal / External reports are separated
- External report is copied from internal and can be manually synced
- Auto-save must be implemented
- Word export must use structured docx (NOT HTML conversion)
