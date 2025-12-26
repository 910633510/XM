# xSimple VPN Privacy Policy

**Effective:** May 1, 2024  
**Next review:** November 2024

## Overview

xSimple VPN provides hardened remote access for field teams. XM LLC limits the collection of device and session data to only what is required to enforce zero-trust policies while keeping customer traffic confidential.

## Data Captured

- Device posture telemetry (OS version, patch level, EDR status) to evaluate connection health.
- Session metadata such as tunnel start/stop time, gateway assignment, and service tags. Payload content remains opaque to XM.
- Optional coarse location hints derived from gateway selection to optimize routing; precise GPS is never collected.

## Processing & Retention

- Metadata is encrypted using TLS 1.3 from edge to control plane and stored in customer-specific clusters.
- Session logs roll off after 90 days unless a customer extends retention for an active investigation.
- Device fingerprints are hashed with rotating salts to prevent cross-environment correlation.

## Security & Access

- Administrative access requires hardware-backed MFA and is fully audited; support personnel receive redacted metadata views.
- Short-lived certificates enforce forward secrecy so compromised keys cannot decrypt prior sessions.
- Continuous monitoring detects anomalous tunnel behavior, triggering automated containment workflows.

## Customer Controls

- Customers configure retention policies, approved geographies, and notification contacts through the console.
- Export packages include signed hashes for tamper evidence and SIEM ingestion.
- Quarterly privacy attestations align to FedRAMP Moderate and CJIS obligations.

For additional information, contact **privacy@xm-llc.com**.
