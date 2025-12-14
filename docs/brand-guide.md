# 🎨 Brand & Style Guide

Welcome to the **Russ.fm** design system. This project utilizes a "Modern 2025 - Neo-Glass Theme" aesthetic, characterized by deep depth, glassmorphism, and fluid animations.

## 📐 Design Philosophy

The design language mimics a premium, tangible interface. It moves away from flat design towards a rich, layered experience where content sits on "glass" panels floating above a dynamic background.

**Key Principles:**
-   **Depth**: Use of shadows and layers to create hierarchy.
-   **Glass**: Translucent backgrounds (`backdrop-filter`) to hint at content behind.
-   **Motion**: Subtle floating animations and entrance effects to make the UI feel alive.

---

## 🔠 Typography

We use a dual-font system to balance personality with readability.

### Primary Font: **[Outfit](https://fonts.google.com/specimen/Outfit)**
Used for Headings and Brand elements. A geometric sans-serif that feels modern and friendly.

| Element | Class | Size Logic | Weight |
| :--- | :--- | :--- | :--- |
| **Heading 1** | `h1` / `.text-h1` | `clamp(2.5rem, 5vw, 4rem)` | Bold (700) |
| **Heading 2** | `h2` / `.text-h2` | `clamp(2rem, 4vw, 3rem)` | Semibold (600) |
| **Heading 3** | `h3` / `.text-h3` | `1.75rem` | Semibold (600) |
| **Heading 4** | `h4` / `.text-h4` | `1.5rem` | Medium (500) |

### Secondary Font: **[Inter](https://fonts.google.com/specimen/Inter)**
Used for Body text, UI elements, and data. The standard for screen readability.

-   **Body**: Standard text uses `leading-relaxed` for optimal reading flow.
-   **Weights**: Predominantly Regular (400) and Medium (500).

---

## 🎨 Color Palette

### System Colors (Zinc)
The interface uses a neutral "Zinc" scale that adapts to Light/Dark modes.

| Token | Light Mode (`#FAFAFA` base) | Dark Mode (`#1A1A1A` base) | Usage |
| :--- | :--- | :--- | :--- |
| `--background` | `#FAFAFA` (Zinc 50) | `#1A1A1A` | Main page background |
| `--card` | `#FFFFFF` (White) | `#141414` | Solid content containers |
| `--primary` | `#18181B` (Zinc 900) | `#FAFAFA` (Zinc 50) | Main actions / Text |
| `--muted` | `#F4F4F5` (Zinc 100) | `#262626` | Secondary backgrounds |
| `--border` | `#E4E4E7` (Zinc 200) | `#333333` | Hairline borders |

### Brand Colors (Services)
Used for integration buttons and specific branding elements.

| Service | Hex Code | Variable |
| :--- | :--- | :--- |
| **Discogs** | `#333333` | `.btn-discogs` |
| **Spotify** | `#1DB954` | `.btn-spotify` |
| **Apple Music** | `#FF4E6B` | `.btn-apple-music` |
| **Last.fm** | `#D51007` | `.btn-lastfm` |
| **Wikipedia** | `#636466` | `.btn-wikipedia` |

---

## 💎 UI Components

### Glassmorphism
The signature look of the application.

-   **Glass Card**:
    ```css
    .glass-card {
      backdrop-filter: blur(12px);
      background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
      border: 1px solid rgba(255,255,255,0.08);
    }
    ```

### Animations
Custom keyframes defined in `tailwind.config.ts`.

-   **`animate-float`**: A gentle 3s vertical movement. Used on hero images.
-   **`animate-enter`**: A fade-in distinct slide-up effect. Used for page content loading.
    -   Delays: `.animate-enter-delay-1` (100ms), `.animate-enter-delay-2` (200ms).

### Bento Grid
A responsive CSS Grid system for displaying content blocks.

-   **Class**: `.dynamic-bento-grid`
-   **Desktop**: 6 columns, dynamic row height.
-   **Tablet**: 4 columns.
-   **Mobile**: 2 columns.

---

## 🖼️ Aspect Ratios

Strict aspect ratios used to maintain visual rhythm.

-   **Album Covers**: `1/1` (Square)
-   **Artist Avatars**: `1/1` (Square, `rounded-full`)
-   **Feature Cards**: `16/9` or `4/3` depending on context.

> [!IMPORTANT]
> Always use `object-cover` on images to ensure they fill these containers without distortion.
