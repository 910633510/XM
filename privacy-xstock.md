# xStock Monitor Privacy Policy

**Effective:** April 4, 2024  
**Next review:** October 2024

## Overview

xStock Monitor aggregates regulated market feeds and internal research data to surface alerts for compliance teams. XM LLC enforces strong tokenization, retention, and audit controls to protect trading intelligence.

## Data Sources

- Market data delivered through customer-managed VPN tunnels.
- Internal risk memos and ratings synchronized via hardened SFTP.
- Minimal user profile data (role, desk, regulatory restrictions) to enforce entitlements.

## Processing Controls

- Each source uses irreversible tokenization with customer-specific keys.
- Alert payloads retain only actionable context for 30 days unless escalated to audit.
- Training zones for surveillance and research remain segmented to uphold SOX and Chinese Wall obligations.

## Security & Access

- Conditional access integrates with client IdPs, enforcing MFA and trader entitlements.
- Feed ingestion endpoints rely on signed requests, hardware root of trust, and immutable audit logs retained for seven years.
- Quarterly red-team testing validates insider threat monitoring, with findings shared under NDA.

## Customer Oversight

- Clients configure retention, jurisdiction, and surveillance rules before onboarding.
- Daily privacy status reports summarize ingestion health, alert volume, and purge tickets.
- A dedicated XM operator coordinates SEC, FINRA, and SOX compliance oversight throughout the deployment.

For additional information, contact **privacy@xm-llc.com**.
