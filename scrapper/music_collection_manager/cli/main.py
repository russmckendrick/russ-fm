"""Main CLI entry point."""

import click
import logging
from pathlib import Path

from ..config import ConfigManager, setup_logging
from .commands import ReleaseCommand, CollectionCommand, TestCommand, ReportCommand


@click.group()
@click.option(
    "--config", 
    "-c", 
    type=click.Path(exists=True), 
    help="Configuration file path"
)
@click.option(
    "--log-level", 
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"]), 
    default="INFO",
    help="Logging level"
)
@click.option(
    "--log-file", 
    type=click.Path(), 
    help="Log file path"
)
@click.option(
    "--session-logs/--no-session-logs",
    default=True,
    help="Create separate log file for each session (default: enabled)"
)
@click.pass_context
def cli(ctx, config, log_level, log_file, session_logs):
    """Music Collection Manager - Enrich your music collection with data from multiple sources."""
    
    # Ensure context object exists
    ctx.ensure_object(dict)
    
    # Load configuration
    config_manager = ConfigManager(config)
    ctx.obj["config"] = config_manager
    
    # Set up logging
    if not log_file:
        log_file = config_manager.get("logging.file")
    
    logger = setup_logging(
        level=log_level,
        log_file=log_file,
        log_format=config_manager.get("logging.format"),
        session_based=session_logs
    )
    ctx.obj["logger"] = logger
    
    # Log startup info
    logger.info("Music Collection Manager started")
    logger.debug(f"Configuration: {config_manager}")


@cli.command()
@click.argument("discogs_id")
@click.option(
    "--output", 
    "-o", 
    type=click.Choice(["json", "yaml", "table"]), 
    default="table",
    help="Output format"
)
@click.option(
    "--save", 
    is_flag=True, 
    help="Save to database"
)
@click.option(
    "--services", 
    multiple=True,
    type=click.Choice(["discogs", "apple_music", "spotify", "wikipedia", "lastfm", "theaudiodb"]),
    help="Specific services to use (default: all available)"
)
@click.option(
    "--force-refresh", 
    is_flag=True, 
    help="Force refresh data from APIs, bypassing database cache"
)
@click.option(
    "--interactive", 
    is_flag=True, 
    help="Show search results and let user select correct matches (use with --force-refresh)"
)
@click.option(
    "--search", 
    help="Override search query for enrichment services (e.g., 'Tim\\'s Listening Party Part Two')"
)
@click.option(
    "--custom-cover", 
    help="Override album artwork with custom image URL"
)
@click.option(
    "--v1", 
    is_flag=True, 
    help="Fetch album artwork from v1.russ.fm site"
)
@click.pass_context
def release(ctx, discogs_id, output, save, services, force_refresh, interactive, search, custom_cover, v1):
    """Get and enrich data for a single release by Discogs ID."""
    command = ReleaseCommand(ctx.obj["config"], ctx.obj["logger"])
    command.execute(discogs_id, output, save, list(services), force_refresh, interactive, search, custom_cover, v1)


@cli.command()
@click.option(
    "--username", 
    "-u", 
    help="Discogs username (uses config default if not specified)"
)
@click.option(
    "--limit", 
    "-l", 
    type=int, 
    help="Limit number of items to process"
)
@click.option(
    "--from", 
    "from_index",
    type=int, 
    help="Start processing from this index (0-based)"
)
@click.option(
    "--to", 
    "to_index",
    type=int, 
    help="Process up to this index (exclusive)"
)
@click.option(
    "--batch-size", 
    "-b", 
    type=int, 
    default=10,
    help="Batch size for processing"
)
@click.option(
    "--resume", 
    is_flag=True, 
    help="Resume from last processed item"
)
@click.option(
    "--dry-run", 
    is_flag=True, 
    help="Show what would be processed without actually doing it"
)
@click.option(
    "--force-refresh", 
    "-f", 
    is_flag=True, 
    help="Force refresh data from APIs, bypassing database cache"
)
@click.option(
    "--interactive", 
    "-i", 
    is_flag=True, 
    help="Show search results and let user select correct matches (use with --force-refresh)"
)
@click.pass_context
def collection(ctx, username, limit, from_index, to_index, batch_size, resume, dry_run, force_refresh, interactive):
    """Process entire Discogs collection."""
    command = CollectionCommand(ctx.obj["config"], ctx.obj["logger"])
    command.execute(username, limit, from_index, to_index, batch_size, resume, dry_run, force_refresh, interactive)


@cli.command()
@click.pass_context
def test(ctx):
    """Test all configured services."""
    command = TestCommand(ctx.obj["config"], ctx.obj["logger"])
    command.execute()


@cli.command()
@click.option(
    "--output", 
    "-o", 
    type=click.Path(), 
    default="config.example.json",
    help="Output file path"
)
def init(output):
    """Create example configuration file."""
    config_manager = ConfigManager()
    config_manager.create_example_config(output)


@cli.command()
@click.pass_context
def status(ctx):
    """Show database and processing status."""
    from ..utils import DatabaseManager
    
    config = ctx.obj["config"]
    db_path = config.get("database.path", "collection_cache.db")
    
    if not Path(db_path).exists():
        click.echo("Database not found. Run 'collection' command first.")
        return
    
    db = DatabaseManager(db_path, ctx.obj["logger"])
    stats = db.get_stats()
    
    click.echo("Database Status:")
    click.echo(f"  Total releases: {stats.get('total_releases', 0)}")
    click.echo(f"  Collection items: {stats.get('total_collection_items', 0)}")
    click.echo(f"  Processed items: {stats.get('processed_items', 0)}")
    click.echo(f"  Enriched items: {stats.get('enriched_items', 0)}")
    
    # Show processing progress
    if stats.get('total_collection_items', 0) > 0:
        processed_pct = (stats.get('processed_items', 0) / stats['total_collection_items']) * 100
        enriched_pct = (stats.get('enriched_items', 0) / stats['total_collection_items']) * 100
        
        click.echo(f"  Processing progress: {processed_pct:.1f}%")
        click.echo(f"  Enrichment progress: {enriched_pct:.1f}%")


@cli.command()
@click.option(
    "--backup-path", 
    "-b", 
    type=click.Path(), 
    help="Backup file path (default: timestamped backup)"
)
@click.pass_context
def backup(ctx, backup_path):
    """Backup the database."""
    from ..utils import DatabaseManager
    from datetime import datetime
    
    config = ctx.obj["config"]
    db_path = config.get("database.path", "collection_cache.db")
    
    if not Path(db_path).exists():
        click.echo("Database not found.")
        return
    
    # Create backup folder if it doesn't exist
    backup_folder = Path("backups")
    backup_folder.mkdir(exist_ok=True)
    
    if not backup_path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"collection_cache_backup_{timestamp}.db"
        backup_path = backup_folder / backup_filename
    else:
        # If user provides a path, still put it in the backup folder unless it's an absolute path
        backup_path = Path(backup_path)
        if not backup_path.is_absolute():
            backup_path = backup_folder / backup_path
    
    db = DatabaseManager(db_path, ctx.obj["logger"])
    if db.backup_database(str(backup_path)):
        click.echo(f"Database backed up to: {backup_path}")
    else:
        click.echo("Failed to backup database.")


@cli.command()
@click.argument("artist_name")
@click.option(
    "--save", 
    "-s", 
    is_flag=True, 
    help="Save to database"
)
@click.option(
    "--output", 
    "-o", 
    type=click.Choice(["table", "json", "yaml"]), 
    default="table",
    help="Output format"
)
@click.option(
    "--force-refresh", 
    "-f", 
    is_flag=True, 
    help="Force refresh from APIs instead of using cache"
)
@click.option(
    "--interactive", 
    "-i", 
    is_flag=True, 
    help="Enable interactive mode for manual artist selection"
)
@click.option(
    "--custom-image", 
    help="Override artist image with custom image URL"
)
@click.option(
    "--v1", 
    is_flag=True, 
    help="Fetch artist image from v1.russ.fm site"
)
@click.option(
    "--verify", 
    is_flag=True, 
    help="Verify artist matches by comparing releases from Apple Music and Spotify"
)
@click.option(
    "--prefer",
    type=click.Choice(["apple_music", "spotify", "theaudiodb", "discogs", "v1"]),
    help="Preferred image source (apple_music, spotify, theaudiodb, discogs, v1)"
)
@click.option(
    "--theaudiodb",
    is_flag=True,
    help="Only fetch TheAudioDB data (skip other services except Discogs)"
)
@click.pass_context
def artist(ctx, artist_name, save, output, force_refresh, interactive, custom_image, v1, verify, prefer, theaudiodb):
    """Get comprehensive artist information."""
    from ..utils.artist_orchestrator import ArtistDataOrchestrator
    from ..utils.serializers import ArtistSerializer
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich import box
    import json
    import yaml
    
    console = Console()
    config = ctx.obj["config"]
    logger = ctx.obj["logger"]
    
    # Initialize artist orchestrator with add services if --theaudiodb is specified
    if theaudiodb:
        # Add TheAudioDB data to existing enrichment data
        add_services = ["theaudiodb"]
        orchestrator = ArtistDataOrchestrator(config, logger, add_services=add_services)
        console.print(f"[yellow]TheAudioDB mode enabled - adding TheAudioDB data to existing artist data[/yellow]")
    else:
        orchestrator = ArtistDataOrchestrator(config, logger)
    
    # Enable interactive mode if requested
    if interactive:
        orchestrator.set_interactive_mode(True)
        console.print(f"[cyan]Interactive mode enabled - you'll be prompted to select artist matches[/cyan]")
    
    # Set custom image if provided
    if custom_image:
        orchestrator.set_custom_image(custom_image)
        console.print(f"[yellow]Using custom image: '{custom_image}'[/yellow]")
    
    # Handle v1 flag - fetch image from v1.russ.fm
    if v1:
        from ..utils.v1_site_helper import V1SiteHelper
        
        console.print(f"[blue]Searching v1.russ.fm for artist images...[/blue]")
        try:
            artist_images = V1SiteHelper.find_artist_images(artist_name)
            
            if artist_images:
                # Get the first matching artist image
                artist_key = list(artist_images.keys())[0]
                v1_image_url = artist_images[artist_key]
                orchestrator.set_custom_image(v1_image_url)
                console.print(f"[green]Found artist in v1 index: {artist_key}")
                console.print(f"[yellow]Using v1.russ.fm image: {v1_image_url}[/yellow]")
            else:
                console.print(f"[red]Artist '{artist_name}' not found in v1.russ.fm index[/red]")
                
        except Exception as e:
            console.print(f"[red]Error accessing v1.russ.fm data: {str(e)}[/red]")
    
    # Set preferred image source if specified
    if prefer:
        orchestrator.set_preferred_image_source(prefer)
        console.print(f"[blue]Preferred image source set to: {prefer}[/blue]")
    
    with console.status(f"[bold green]Fetching artist data for: {artist_name}"):
        # Get artist data
        artist_obj = orchestrator.get_artist_by_name(artist_name, force_refresh=force_refresh)
        
        if not artist_obj:
            console.print(f"[red]Artist not found: {artist_name}[/red]")
            return
    
    # Display results based on output format
    if output == "json":
        data = ArtistSerializer.to_dict(artist_obj, include_enrichment=True)
        console.print_json(json.dumps(data, indent=2, ensure_ascii=False))
    
    elif output == "yaml":
        data = ArtistSerializer.to_dict(artist_obj, include_enrichment=True)
        console.print(yaml.dump(data, default_flow_style=False, allow_unicode=True))
    
    else:  # table format
        # Create main info panel
        info_lines = []
        if artist_obj.biography:
            # Truncate biography for display
            bio = artist_obj.biography[:300] + "..." if len(artist_obj.biography) > 300 else artist_obj.biography
            info_lines.append(f"[dim]{bio}[/dim]")
        
        if artist_obj.genres:
            info_lines.append(f"\n[bold]Genres:[/bold] {', '.join(artist_obj.genres[:10])}")
        
        if artist_obj.popularity:
            info_lines.append(f"[bold]Popularity:[/bold] {artist_obj.popularity}/100")
        
        if artist_obj.followers:
            info_lines.append(f"[bold]Followers:[/bold] {artist_obj.followers:,}")
        
        # Show message if no data found
        if not info_lines:
            info_lines.append("[yellow]No detailed information found. Configure additional API services (Apple Music, Spotify, Last.fm) for richer data.[/yellow]")
        
        console.print(Panel("\n".join(info_lines), title=f"[bold cyan]{artist_name}[/bold cyan]", box=box.ROUNDED))
        
        # Create services table
        table = Table(title="External Services", box=box.ROUNDED)
        table.add_column("Service", style="cyan", no_wrap=True)
        table.add_column("ID", style="yellow")
        table.add_column("URL", style="blue")
        
        if artist_obj.apple_music_id:
            table.add_row("Apple Music", artist_obj.apple_music_id, artist_obj.apple_music_url or "")
        
        if artist_obj.spotify_id:
            table.add_row("Spotify", artist_obj.spotify_id, artist_obj.spotify_url or "")
        
        if artist_obj.lastfm_mbid:
            table.add_row("Last.fm", artist_obj.lastfm_mbid, artist_obj.lastfm_url or "")
        
        if artist_obj.wikipedia_url:
            table.add_row("Wikipedia", "—", artist_obj.wikipedia_url)
        
        if table.row_count > 0:
            console.print(table)
        
        # Show image info
        if artist_obj.images:
            console.print(f"\n[green]Found {len(artist_obj.images)} artist images from services[/green]")
        
        if artist_obj.local_images:
            console.print(f"[green]Downloaded images: {', '.join(artist_obj.local_images.keys())}[/green]")
    
    # Perform release verification if requested
    if verify:
        console.print(f"\n[cyan]🎵 Release Verification[/cyan]")
        
        # Create verification table
        verification_table = Table(title="Release Verification Results", box=box.ROUNDED)
        verification_table.add_column("Service", style="cyan", no_wrap=True)
        verification_table.add_column("Matches", style="yellow")
        verification_table.add_column("Confidence", style="green")
        verification_table.add_column("Match %", style="blue")
        
        verification_performed = False
        
        # Verify Apple Music if available
        if artist_obj.apple_music_id:
            verification_result = orchestrator.verify_apple_music_artist_with_releases(artist_obj, artist_obj.apple_music_id)
            if 'error' not in verification_result:
                verification_performed = True
                matches = len(verification_result.get('matches', []))
                total = verification_result.get('total_known_releases', 0)
                confidence = verification_result.get('confidence_level', 'LOW')
                percentage = verification_result.get('match_percentage', 0) * 100
                
                verification_table.add_row(
                    "Apple Music", 
                    f"{matches}/{total}",
                    confidence,
                    f"{percentage:.0f}%"
                )
                
                # Show sample matches
                if verification_result.get('matches') and output == "table":
                    console.print(f"\n[dim]Apple Music matches (showing first 3):[/dim]")
                    for i, match in enumerate(verification_result['matches'][:3], 1):
                        match_type_color = "green" if match.match_type == "exact" else "yellow"
                        console.print(f"  {i}. {match.discogs_title} → {match.service_title} ([{match_type_color}]{match.match_type}[/{match_type_color}])")
            else:
                console.print(f"[yellow]Apple Music verification failed: {verification_result['error']}[/yellow]")
        
        # Verify Spotify if available
        if artist_obj.spotify_id:
            verification_result = orchestrator.verify_spotify_artist_with_releases(artist_obj, artist_obj.spotify_id)
            if 'error' not in verification_result:
                verification_performed = True
                matches = len(verification_result.get('matches', []))
                total = verification_result.get('total_known_releases', 0)
                confidence = verification_result.get('confidence_level', 'LOW')
                percentage = verification_result.get('match_percentage', 0) * 100
                
                verification_table.add_row(
                    "Spotify", 
                    f"{matches}/{total}",
                    confidence,
                    f"{percentage:.0f}%"
                )
                
                # Show sample matches
                if verification_result.get('matches') and output == "table":
                    console.print(f"\n[dim]Spotify matches (showing first 3):[/dim]")
                    for i, match in enumerate(verification_result['matches'][:3], 1):
                        match_type_color = "green" if match.match_type == "exact" else "yellow"
                        console.print(f"  {i}. {match.discogs_title} → {match.service_title} ([{match_type_color}]{match.match_type}[/{match_type_color}])")
            else:
                console.print(f"[yellow]Spotify verification failed: {verification_result['error']}[/yellow]")
        
        # Display verification table if we have results
        if verification_performed and verification_table.row_count > 0:
            console.print(verification_table)
        elif not verification_performed:
            console.print(f"[yellow]No services available for verification. Artist needs Apple Music or Spotify IDs.[/yellow]")
    
    # Save to database if requested
    if save:
        from ..utils.database import DatabaseManager
        db_path = config.get("database", {}).get("path", "collection_cache.db")
        db = DatabaseManager(db_path, logger)
        
        if db.save_artist(artist_obj):
            console.print(f"\n[green]Artist saved to database[/green]")
        else:
            console.print(f"\n[red]Failed to save artist to database[/red]")


@cli.command()
@click.option(
    "--from", 
    "start_idx", 
    type=int, 
    default=0, 
    help="Start index for batch processing"
)
@click.option(
    "--to", 
    "end_idx", 
    type=int, 
    default=10, 
    help="End index for batch processing"
)
@click.option(
    "--save", 
    "-s", 
    is_flag=True, 
    help="Save artists to database"
)
@click.option(
    "--verify", 
    is_flag=True, 
    help="Verify artist matches by comparing releases"
)
@click.option(
    "--interactive", 
    "-i", 
    is_flag=True, 
    help="Enable interactive mode for manual artist selection"
)
@click.option(
    "--include-various", 
    is_flag=True, 
    help="Include Various Artists in processing"
)
@click.option(
    "--stats", 
    is_flag=True, 
    help="Show processing statistics instead of processing artists"
)
@click.option(
    "--force-refresh", 
    "-f", 
    is_flag=True, 
    help="Force refresh artist data from APIs instead of using cache"
)
@click.option(
    "--prefer",
    type=click.Choice(["apple_music", "spotify", "theaudiodb", "discogs", "v1"]),
    help="Preferred image source (apple_music, spotify, theaudiodb, discogs, v1)"
)
@click.option(
    "--theaudiodb",
    is_flag=True,
    help="Only fetch TheAudioDB data (skip other services except Discogs)"
)
@click.pass_context
def artist_batch(ctx, start_idx, end_idx, save, verify, interactive, include_various, stats, force_refresh, prefer, theaudiodb):
    """Process multiple artists from collection in batches with release verification."""
    from ..utils.artist_orchestrator import ArtistDataOrchestrator
    from ..utils.database import DatabaseManager
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich import box
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
    from collections import defaultdict
    import json
    import sqlite3
    
    console = Console()
    config = ctx.obj["config"]
    logger = ctx.obj["logger"]
    
    # Initialize database
    db_path = config.get("database", {}).get("path", "collection_cache.db")
    db_manager = DatabaseManager(db_path, logger)
    
    if stats:
        # Show processing statistics
        console.print("=" * 80)
        console.print("[bold cyan]ARTIST BATCH PROCESSING STATISTICS[/bold cyan]")
        console.print("=" * 80)
        console.print()
        
        # Get artist statistics from database
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Query to get unique artists from releases
        query = """
            SELECT artists, title, genres 
            FROM releases 
            WHERE artists IS NOT NULL
        """
        
        if not include_various:
            query += " AND artists NOT LIKE '%Various%'"
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        artists_map = {}
        confidence_breakdown = defaultdict(int)
        genres_coverage = defaultdict(int)
        
        for row in rows:
            try:
                artists = json.loads(row['artists'])
                genres = json.loads(row['genres']) if row['genres'] else []
                
                for artist in artists:
                    if not include_various and artist['name'] == 'Various Artists':
                        continue
                    
                    discogs_id = artist.get('discogs_id', '')
                    if discogs_id and discogs_id not in artists_map:
                        artists_map[discogs_id] = {
                            'name': artist['name'],
                            'releases': [row['title']],
                            'genres': genres[:5]
                        }
                        
                        # Simple confidence calculation based on release context
                        if artist['name'].lower() in row['title'].lower():
                            confidence_breakdown['HIGH'] += 1
                        else:
                            confidence_breakdown['LOW'] += 1
                    elif discogs_id in artists_map:
                        artists_map[discogs_id]['releases'].append(row['title'])
                        
                        # Merge genres
                        for genre in genres:
                            if genre not in artists_map[discogs_id]['genres']:
                                artists_map[discogs_id]['genres'].append(genre)
                
                # Count genres
                for genre in genres:
                    genres_coverage[genre] += 1
                    
            except json.JSONDecodeError:
                continue
        
        conn.close()
        
        console.print(f"[green]Total Artists to Process: {len(artists_map)}[/green]")
        console.print()
        
        console.print("[yellow]Confidence Breakdown:[/yellow]")
        for confidence, count in confidence_breakdown.items():
            console.print(f"  {confidence}: {count} artists")
        console.print()
        
        # Top artists by release count
        sorted_artists = sorted(artists_map.values(), key=lambda x: len(x['releases']), reverse=True)[:10]
        console.print("[yellow]Top 10 Artists by Release Count:[/yellow]")
        for i, artist in enumerate(sorted_artists, 1):
            console.print(f"  {i}. {artist['name']} - {len(artist['releases'])} releases")
        console.print()
        
        # Top genres
        sorted_genres = sorted(genres_coverage.items(), key=lambda x: x[1], reverse=True)[:10]
        console.print("[yellow]Top Genres:[/yellow]")
        for genre, count in sorted_genres:
            console.print(f"  {genre}: {count} artists")
        
        return
    
    # Process batch of artists
    console.print("=" * 80)
    console.print(f"[bold cyan]PROCESSING ARTISTS: {start_idx} to {end_idx}[/bold cyan]")
    console.print("=" * 80)
    console.print()
    
    # Extract artists from releases (same logic as enhanced processor)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    query = """
        SELECT artists, title, genres, discogs_id 
        FROM releases 
        WHERE artists IS NOT NULL
    """
    
    if not include_various:
        query += " AND artists NOT LIKE '%Various%'"
    
    cursor.execute(query)
    rows = cursor.fetchall()
    
    artists_map = {}
    
    for row in rows:
        try:
            artists = json.loads(row['artists'])
            genres = json.loads(row['genres']) if row['genres'] else []
            
            for artist in artists:
                if not include_various and artist['name'] == 'Various Artists':
                    continue
                
                discogs_id = artist.get('discogs_id', '')
                if not discogs_id:
                    continue
                
                if discogs_id not in artists_map:
                    artists_map[discogs_id] = {
                        'name': artist['name'],
                        'discogs_id': discogs_id,
                        'release_count': 1,
                        'sample_releases': [row['title']],
                        'genres': genres[:5]
                    }
                else:
                    artists_map[discogs_id]['release_count'] += 1
                    if row['title'] not in artists_map[discogs_id]['sample_releases']:
                        artists_map[discogs_id]['sample_releases'].append(row['title'])
        
        except json.JSONDecodeError:
            continue
    
    conn.close()
    
    # Sort by release count
    sorted_artists = sorted(artists_map.values(), key=lambda x: x['release_count'], reverse=True)
    
    # Get the requested batch
    batch_artists = sorted_artists[start_idx:end_idx]
    
    if not batch_artists:
        console.print("[red]No artists found in the specified range.[/red]")
        return
    
    # Initialize orchestrator with add services if --theaudiodb is specified
    if theaudiodb:
        # Add TheAudioDB data to existing enrichment data
        add_services = ["theaudiodb"]
        orchestrator = ArtistDataOrchestrator(config, logger, add_services=add_services)
        console.print(f"[yellow]TheAudioDB mode enabled - adding TheAudioDB data to existing artist data[/yellow]")
    else:
        orchestrator = ArtistDataOrchestrator(config, logger)
    
    # Enable interactive mode if requested
    if interactive:
        orchestrator.set_interactive_mode(True)
        console.print(f"[cyan]Interactive mode enabled - you'll be prompted to select artist matches[/cyan]")
    
    # Show force refresh status
    if force_refresh:
        console.print(f"[yellow]Force refresh enabled - ignoring cached data and fetching fresh from APIs[/yellow]")
    
    # Set preferred image source if specified
    if prefer:
        orchestrator.set_preferred_image_source(prefer)
        console.print(f"[blue]Preferred image source set to: {prefer}[/blue]")
    
    # Process each artist
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
        transient=False,
    ) as progress:
        
        task = progress.add_task("Processing artists...", total=len(batch_artists))
        
        for i, artist_data in enumerate(batch_artists):
            artist_name = artist_data['name']
            discogs_id = artist_data['discogs_id']
            
            progress.update(task, description=f"Processing {artist_name}...")
            
            # Get comprehensive artist data
            artist_obj = orchestrator.get_artist_by_name(artist_name, force_refresh=force_refresh)
            
            if not artist_obj:
                console.print(f"[red]Failed to process artist: {artist_name}[/red]")
                progress.advance(task)
                continue
            
            # Display artist info
            console.print(f"\n[bold cyan]{start_idx + i + 1}. {artist_name}[/bold cyan]")
            console.print(f"   Discogs ID: {discogs_id}")
            console.print(f"   Discogs URL: https://www.discogs.com/artist/{discogs_id}")
            console.print(f"   Release Count: {artist_data['release_count']}")
            
            if artist_data['genres']:
                console.print(f"   Genres: {', '.join(artist_data['genres'])}")
            
            # Show external services
            services_found = []
            if artist_obj.apple_music_id:
                services_found.append(f"Apple Music: {artist_obj.apple_music_url}")
            if artist_obj.spotify_id:
                services_found.append(f"Spotify: {artist_obj.spotify_url}")
            if artist_obj.lastfm_mbid:
                services_found.append(f"Last.fm: {artist_obj.lastfm_url}")
            if artist_obj.wikipedia_url:
                services_found.append(f"Wikipedia: {artist_obj.wikipedia_url}")
            
            if services_found:
                console.print(f"   External Services:")
                for service in services_found:
                    console.print(f"     • {service}")
            
            # Perform release verification if requested
            if verify and (artist_obj.apple_music_id or artist_obj.spotify_id):
                console.print(f"   [cyan]🎵 Release Verification:[/cyan]")
                
                verification_results = []
                
                # Verify Apple Music
                if artist_obj.apple_music_id:
                    apple_result = orchestrator.verify_apple_music_artist_with_releases(artist_obj, artist_obj.apple_music_id)
                    if 'error' not in apple_result:
                        matches = len(apple_result.get('matches', []))
                        total = apple_result.get('total_known_releases', 0)
                        percentage = apple_result.get('match_percentage', 0) * 100
                        confidence = apple_result.get('confidence_level', 'LOW')
                        
                        console.print(f"     🍎 Apple Music: {matches}/{total} matched ({percentage:.0f}%) - {confidence}")
                        verification_results.append(('Apple Music', apple_result))
                
                # Verify Spotify
                if artist_obj.spotify_id:
                    spotify_result = orchestrator.verify_spotify_artist_with_releases(artist_obj, artist_obj.spotify_id)
                    if 'error' not in spotify_result:
                        matches = len(spotify_result.get('matches', []))
                        total = spotify_result.get('total_known_releases', 0)
                        percentage = spotify_result.get('match_percentage', 0) * 100
                        confidence = spotify_result.get('confidence_level', 'LOW')
                        
                        console.print(f"     🟢 Spotify: {matches}/{total} matched ({percentage:.0f}%) - {confidence}")
                        verification_results.append(('Spotify', spotify_result))
                
                # Show sample matches
                for service_name, result in verification_results:
                    matches = result.get('matches', [])
                    if matches:
                        console.print(f"     Sample {service_name} matches:")
                        for match in matches[:2]:
                            console.print(f"       • {match.discogs_title} → {match.service_title}")
            
            # Save to database if requested
            if save:
                if db_manager.save_artist(artist_obj):
                    console.print(f"   [green]✅ Saved to database[/green]")
                else:
                    console.print(f"   [red]❌ Failed to save to database[/red]")
            
            console.print("-" * 70)
            progress.advance(task)
    
    console.print(f"\n[bold green]✅ Batch processing complete![/bold green]")
    console.print(f"Processed {len(batch_artists)} artists from index {start_idx} to {end_idx}")


@cli.command()
@click.option(
    "--output-file", 
    "-o", 
    type=click.Path(), 
    help="Save report to file"
)
@click.option(
    "--format", 
    "output_format",
    type=click.Choice(["text", "json"]), 
    default="text",
    help="Output format"
)
@click.option(
    "--limit", 
    "-l", 
    type=int, 
    help="Limit number of results"
)
@click.option(
    "--filter-config", 
    "-f", 
    type=click.Path(exists=True), 
    help="Path to filter configuration file"
)
@click.option(
    "--include-unprocessed/--no-include-unprocessed",
    default=True,
    help="Include releases without service data (default: enabled)"
)
@click.pass_context
def report(ctx, output_file, output_format, limit, filter_config, include_unprocessed):
    """Generate album matching report comparing Discogs, Apple Music, and Spotify."""
    config = ctx.obj["config"]
    logger = ctx.obj["logger"]
    
    # Initialize report command
    report_cmd = ReportCommand(config, logger)
    
    # Execute album matching report
    report_cmd.execute_album_matching_report(
        output_file=output_file,
        output_format=output_format,
        limit=limit,
        filter_config=filter_config,
        include_unprocessed=include_unprocessed
    )


@cli.command()
@click.option(
    "--output", 
    "-o", 
    type=click.Path(), 
    help="Output file path (default: data/collection.json)"
)
@click.option(
    "--data-path", 
    "-d", 
    type=click.Path(exists=True), 
    help="Data directory path (overrides config setting)"
)
@click.pass_context
def generate_collection(ctx, output, data_path):
    """Generate collection.json file for React app integration."""
    from ..utils.collection_generator import CollectionGenerator
    from rich.console import Console
    
    config = ctx.obj["config"]
    logger = ctx.obj["logger"]
    console = Console()
    
    # Use data path from config if not overridden by command line
    if data_path is None:
        data_path = config.get("data.path", "data")
    
    # Initialize collection generator
    generator = CollectionGenerator(data_path, config.config, logger)
    
    with console.status("[bold green]Generating collection.json..."):
        try:
            output_path = generator.generate_collection_json(output)
            console.print(f"[green]✓ Generated collection.json: {output_path}[/green]")
            
            # Show stats
            import json
            with open(output_path, 'r') as f:
                collection_data = json.load(f)
                
            console.print(f"[cyan]  - Total entries: {len(collection_data)}[/cyan]")
            
            if collection_data:
                console.print(f"[cyan]  - Sample entry fields: {', '.join(collection_data[0].keys())}[/cyan]")
                
        except Exception as e:
            console.print(f"[red]✗ Failed to generate collection.json: {str(e)}[/red]")
            logger.error(f"Collection generation failed: {str(e)}")


def main():
    """Main entry point."""
    cli()


if __name__ == "__main__":
    main()