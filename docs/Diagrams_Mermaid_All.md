# All Diagrams (Mermaid) — Export to PNG/SVG

Paste into [mermaid.live](https://mermaid.live) or use VS Code Mermaid extension.

---

## A. SOA / logical architecture

```mermaid
flowchart TB
  subgraph Client
    UI[React Web UI]
  end
  subgraph Edge
    K[Kong API Gateway :8000]
  end
  subgraph Microservices
    EQ[Equipment Service]
    RS[Rental Service]
    AC[Account Service]
    PS[Payment Service]
    DC[Damage Claim Service]
    RP[Reputation Service]
    VW[Vision Wrapper]
    CP[Camunda Proxy]
  end
  subgraph DataStores[MySQL per service]
    D1[(equipment_db)]
    D2[(rental_db)]
    D3[(account_db)]
    D4[(payment_db)]
    D5[(damage_db)]
    D6[(reputation_db)]
  end
  subgraph Async
    MQ[(RabbitMQ)]
    NS[Notification Service]
  end
  subgraph External
    ST[Stripe]
    GV[Google Vision API]
    TW[Twilio optional]
  end
  UI --> K
  K --> EQ & RS & AC & PS & DC & RP & CP
  DC --> VW --> GV
  PS --> ST
  EQ --> D1
  RS --> D2
  AC --> D3
  PS --> D4
  DC --> D5
  RP --> D6
  PS --> MQ --> NS --> TW
  PS --> RS
  CP --> RS
  CP --> PS
```

---

## B. Scenario 1 — Rent + pay + lifecycle

```mermaid
sequenceDiagram
  participant UI as React UI
  participant Kong as Kong
  participant CP as Camunda Proxy
  participant RS as Rental Service
  participant PS as Payment Service
  participant EQ as Equipment Service
  participant ST as Stripe
  participant MQ as RabbitMQ
  participant NS as Notification

  UI->>Kong: GET /api/rental/renter/{id}/dashboard
  Kong->>RS: dashboard
  RS-->>UI: rentals, browse flag

  UI->>Kong: GET /api/equipment
  Kong->>EQ: list
  EQ-->>UI: equipment JSON

  UI->>Kong: POST /api/rentals
  Kong->>CP: workflow
  CP->>RS: POST /rental PENDING
  CP->>PS: POST /payment/payrental
  PS-->>CP: checkout_url
  CP-->>UI: processInstanceKey

  UI->>ST: redirect Checkout
  ST->>Kong: POST /webhook/stripe
  Kong->>PS: verify + paid
  PS->>RS: finalize-booking ACTIVE
  PS->>MQ: SendPaymentConfirmation
  MQ->>NS: consume
```

---

## C. Scenario 2 — Late fee

```mermaid
sequenceDiagram
  participant UI as React UI
  participant Kong as Kong
  participant PS as Payment Service
  participant RS as Rental Service
  participant ST as Stripe

  Note over RS: RETURNED, return_timestamp > end_time
  UI->>Kong: POST /api/payment/outstanding
  Kong->>PS: late check + fee
  PS->>RS: mark-late
  UI->>Kong: POST /api/payment/outstanding/{id}/checkout
  PS-->>UI: checkout_url
  UI->>ST: pay
  ST->>Kong: webhook
  Kong->>PS: paid
  PS->>RS: complete-after-late-payment
```

---

## D. Scenario 3 — Damage + Vision

```mermaid
sequenceDiagram
  participant UI as React UI
  participant Kong as Kong
  participant DC as Damage Claim Service
  participant VW as Vision Wrapper
  participant GV as Google Vision

  UI->>Kong: POST /api/damage/claim
  Kong->>DC: DRAFT claim
  UI->>Kong: POST /api/damage/photo
  UI->>Kong: POST /api/damage/analyze
  DC->>VW: vision analyze base64
  VW->>GV: Label detection
  GV-->>VW: labels
  VW-->>DC: damage heuristic
  DC-->>UI: claim + analysis
```

---

## E. Deployment (Docker Compose) — high level

```mermaid
flowchart LR
  subgraph Host
    K[Kong :8000]
    FE[Vite :5173]
  end
  subgraph Containers
    S1[equipment-service]
    S2[rental-service]
    S3[payment-service]
    S4[damage-claim-service]
    S5[others...]
    RMQ[RabbitMQ]
    DB[(MySQL x6)]
  end
  FE --> K
  K --> S1 & S2 & S3 & S4 & S5
  S1 & S2 & S3 & S4 --> DB
  S3 --> RMQ
```
