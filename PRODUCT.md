# Product

## Register

product

## Users

Deloitte DCIT employees, clients, and stakeholders in India attending enterprise demonstrations of the Vaani AI avatar system. Users are professionals who expect a polished, institutional-grade tool. They interact via voice; the UI frames the experience rather than demanding attention. Secondary users: the Deloitte Avatar Systems team running live demos in conference rooms and pitch settings.

## Product Purpose

Vaani is a real-time multilingual AI avatar built for Deloitte's DCIT (Technology and Transformation, Avatar Systems team) in India. It accepts voice input, processes it via Gemini Live (speech-to-text, LLM, text-to-speech), and renders a lip-synced video avatar response. The product demonstrates Deloitte's AI capability to clients. Success means a demo that looks production-ready and feels like a flagship enterprise tool — not a prototype.

## Brand Personality

Authoritative, precise, alive. Deloitte institutional confidence meets real-time AI presence. The interface should communicate that this is serious technology in serious hands — without being cold or static.

## Anti-references

- Generic side-project aesthetics: purple gradients, card-in-card nesting, glassmorphism overuse
- Chatbot UIs with scrolling message logs (Vaani is an avatar, not a chat window)
- Consumer AI product aesthetics (ChatGPT, Copilot, Gemini web UI)
- Bounce or elastic easing anywhere
- SaaS landing page chrome (feature-list cards, hero metrics, eyebrows on every section)

## Design Principles

1. **The avatar is the product.** Every other element exists to frame and amplify the avatar circle. If it competes with the avatar, remove it or move it to the periphery.
2. **State is information.** Listening/thinking/speaking/idle are not decoration — they are the interface. Color, glow, pulse, and motion must communicate state unambiguously.
3. **Deloitte brand, earned.** Use the exact brand palette as specified. Don't dilute with generic tech colors. The green and navy should read as Deloitte immediately.
4. **Enterprise legibility.** Every label, caption, and control must be readable at conference room distances. No micro-type, no low-contrast muted elements.
5. **Motion that serves the conversation.** Animations respond to voice state — they don't play on a schedule. A silent avatar is still, not bouncing.

## Accessibility & Inclusion

- WCAG AA as minimum (contrast, keyboard navigation, ARIA states)
- All interactive elements must have descriptive aria-labels
- `prefers-reduced-motion` respected on all animations: crossfades only, no motion
- Indian language scripts (Devanagari, Tamil, Telugu, Kannada, Malayalam, Bengali) require proper Noto font fallbacks
- RTL support for Urdu
