# Getting Started

This guide will help you set up the **Russ.fm** project locally for development and data collection.

## Prerequisites

Before you begin, ensure you have the following installed:

-   **Node.js** (v18+ recommended)
-   **pnpm** (Package manager)
-   **Python 3.8+**
-   **Git**

## 1. Clone the Repository

```bash
git clone <repository-url>
cd discogs-v2
```

## 2. Backend Setup (Data Collection)

The backend is a Python application located in the `scrapper/` directory. It handles fetching and enriching data from Discogs and other services.

### Set up Virtual Environment

```bash
cd scrapper
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
pip install -e .
```

### Configuration

Initialize the configuration file:

```bash
python main.py init
cp config.example.json config.json
```

Edit `config.json` and add your **Discogs Personal Access Token** (required) and other API keys (optional but recommended). See [Data Collection Documentation](./data-collection.md) for details on API credentials.

### Verify Backend

Run the test command to verify your configuration:

```bash
python main.py test
```

## 3. Frontend Setup (Web Interface)

The frontend is a React application located in the `src/` directory.

### Install Dependencies

Navigate back to the project root and install dependencies:

```bash
cd ..  # If you are in scrapper/
pnpm install
```

### Start Development Server

```bash
pnpm run dev
```

Visit `http://localhost:5173` to see the application running.

## 4. Quick Start: Process Your Collection

To seed the application with data from your Discogs collection:

1.  **Activate Python environment**:
    ```bash
    cd scrapper
    source venv/bin/activate
    ```

2.  **Process valid collection items**:
    ```bash
    # Process the first 10 items to get started quickly
    python main.py collection --limit 10
    ```
    *This creates `public/collection.json` and folders in `public/album/` and `public/artist/`.*

3.  **View it in the App**:
    Detailed pages and the collection view will now be populated with the data you just fetched.

## Next Steps

-   Explore [Data Collection](./data-collection.md) to learn about advanced processing options.
-   Read [Frontend Development](./frontend.md) to understand the UI architecture.
