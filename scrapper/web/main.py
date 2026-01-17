"""FastAPI application entry point for Music Collection Manager Web Interface."""

import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse

from .config import web_config
from .core.auth import get_current_user, verify_credentials
from .core.task_manager import task_manager
from .api.routes import services, releases, collection, artists, descriptions, tasks, reports


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Music Collection Manager Web Interface")
    await task_manager.start()
    yield
    # Shutdown
    logger.info("Shutting down Music Collection Manager Web Interface")
    await task_manager.stop()


# Create FastAPI app
app = FastAPI(
    title="Music Collection Manager",
    description="Web interface for managing and enriching your music collection",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount static files
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Mount public folder for album/artist images (located at ../public relative to scrapper)
public_path = Path(__file__).parent.parent.parent / "public"
if public_path.exists():
    app.mount("/album", StaticFiles(directory=str(public_path / "album")), name="album_images")
    app.mount("/artist", StaticFiles(directory=str(public_path / "artist")), name="artist_images")
    logger.info(f"Mounted public folder from: {public_path}")

# Setup templates
templates_path = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(templates_path))


# Include API routers
app.include_router(services.router)
app.include_router(releases.router)
app.include_router(collection.router)
app.include_router(artists.router)
app.include_router(descriptions.router)
app.include_router(tasks.router)
app.include_router(reports.router)


# Web UI Routes
@app.get("/", response_class=HTMLResponse)
async def root():
    """Redirect to admin dashboard."""
    return RedirectResponse(url="/admin")


@app.get("/admin", response_class=HTMLResponse)
async def dashboard(request: Request, user: str = Depends(verify_credentials)):
    """Admin dashboard page."""
    return templates.TemplateResponse(
        "pages/dashboard.html",
        {"request": request, "user": user, "page_title": "Dashboard"},
    )


@app.get("/admin/releases", response_class=HTMLResponse)
async def releases_page(request: Request, user: str = Depends(verify_credentials)):
    """Releases list page."""
    return templates.TemplateResponse(
        "pages/releases/list.html",
        {"request": request, "user": user, "page_title": "Releases"},
    )


@app.get("/admin/releases/{discogs_id}", response_class=HTMLResponse)
async def release_detail_page(
    request: Request, discogs_id: str, user: str = Depends(verify_credentials)
):
    """Release detail page."""
    return templates.TemplateResponse(
        "pages/releases/detail.html",
        {
            "request": request,
            "user": user,
            "discogs_id": discogs_id,
            "page_title": "Release Details",
        },
    )


@app.get("/admin/collection", response_class=HTMLResponse)
async def collection_page(request: Request, user: str = Depends(verify_credentials)):
    """Collection processing page."""
    return templates.TemplateResponse(
        "pages/collection/index.html",
        {"request": request, "user": user, "page_title": "Collection"},
    )


@app.get("/admin/artists", response_class=HTMLResponse)
async def artists_page(request: Request, user: str = Depends(verify_credentials)):
    """Artists list page."""
    return templates.TemplateResponse(
        "pages/artists/list.html",
        {"request": request, "user": user, "page_title": "Artists"},
    )


@app.get("/admin/artists/{artist_name:path}", response_class=HTMLResponse)
async def artist_detail_page(
    request: Request, artist_name: str, user: str = Depends(verify_credentials)
):
    """Artist detail page."""
    return templates.TemplateResponse(
        "pages/artists/detail.html",
        {
            "request": request,
            "user": user,
            "artist_name": artist_name,
            "page_title": "Artist Details",
        },
    )


@app.get("/admin/descriptions", response_class=HTMLResponse)
async def descriptions_page(request: Request, user: str = Depends(verify_credentials)):
    """Description enrichment page."""
    return templates.TemplateResponse(
        "pages/descriptions/index.html",
        {"request": request, "user": user, "page_title": "Descriptions"},
    )


@app.get("/admin/tasks", response_class=HTMLResponse)
async def tasks_page(request: Request, user: str = Depends(verify_credentials)):
    """Task monitor page."""
    return templates.TemplateResponse(
        "pages/tasks/index.html",
        {"request": request, "user": user, "page_title": "Tasks"},
    )


@app.get("/admin/settings", response_class=HTMLResponse)
async def settings_page(request: Request, user: str = Depends(verify_credentials)):
    """Settings page."""
    return templates.TemplateResponse(
        "pages/settings/index.html",
        {"request": request, "user": user, "page_title": "Settings"},
    )


# Health check endpoint (no auth required)
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}
