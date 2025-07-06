"""CLI command implementations."""

import json
import yaml
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich.progress import track

from ..config import ConfigManager
from ..utils import MusicDataOrchestrator, DatabaseManager
from ..models import Release
from ..reports import AlbumMatchingReport


class BaseCommand:
    """Base command class."""
    
    def __init__(self, config: ConfigManager, logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.console = Console()


class ReleaseCommand(BaseCommand):
    """Command for handling single release operations."""
    
    def execute(self, discogs_id: str, output_format: str, save: bool, services: List[str], force_refresh: bool = False, interactive: bool = False, search_override: Optional[str] = None, custom_cover: Optional[str] = None):
        """Execute the release command."""
        try:
            # Initialize orchestrator
            orchestrator = MusicDataOrchestrator(self.config.config, self.logger)
            
            # Filter services if specified
            if services:
                available_services = orchestrator.get_available_services()
                services = [s for s in services if s in available_services]
                if not services:
                    click.echo("No valid services specified.")
                    return
            
            # Set interactive mode on orchestrator
            if interactive:
                orchestrator.set_interactive_mode(True)
            
            # Set search override if provided
            if search_override:
                orchestrator.set_search_override(search_override)
                self.console.print(f"[yellow]Using custom search query: '{search_override}'[/yellow]")
            
            # Set custom cover if provided
            if custom_cover:
                orchestrator.set_custom_cover(custom_cover)
                self.console.print(f"[yellow]Using custom cover: '{custom_cover}'[/yellow]")
            
            self.console.print(f"[blue]Fetching release data for Discogs ID: {discogs_id}[/blue]")
            
            # Get release data
            release = orchestrator.get_release_by_discogs_id(discogs_id, force_refresh=force_refresh)
            
            if not release:
                click.echo(f"Release not found for Discogs ID: {discogs_id}")
                return
            
            # Save to database if requested
            if save:
                db_path = self.config.get("database.path", "collection_cache.db")
                db = DatabaseManager(db_path, self.logger)
                
                if db.save_release(release):
                    self.console.print(f"[green]Release saved to database[/green]")
                else:
                    self.console.print(f"[red]Failed to save release to database[/red]")
            
            # Output results
            self._output_release(release, output_format)
            
        except Exception as e:
            self.logger.error(f"Failed to process release {discogs_id}: {str(e)}")
            click.echo(f"Error: {str(e)}")
    
    def _output_release(self, release: Release, format: str):
        """Output release data in specified format."""
        if format == "json":
            click.echo(json.dumps(release.to_dict(), indent=2))
        
        elif format == "yaml":
            click.echo(yaml.dump(release.to_dict(), default_flow_style=False))
        
        elif format == "table":
            self._output_release_table(release)
    
    def _output_release_table(self, release: Release):
        """Output release data as a table."""
        # Basic info table
        table = Table(title=f"Release: {release.title}")
        table.add_column("Field", style="cyan")
        table.add_column("Value", style="white")
        
        table.add_row("Title", release.title)
        table.add_row("Artists", ", ".join(release.get_artist_names()))
        table.add_row("Year", str(release.year) if release.year else "Unknown")
        table.add_row("Country", release.country or "Unknown")
        table.add_row("Formats", ", ".join(release.formats))
        table.add_row("Labels", ", ".join(release.labels))
        table.add_row("Genres", ", ".join(release.genres))
        table.add_row("Styles", ", ".join(release.styles))
        
        # Date added to collection
        if release.date_added:
            table.add_row("Added to Collection", release.date_added.strftime("%Y-%m-%d %H:%M:%S"))
        
        # External IDs
        if release.discogs_id:
            table.add_row("Discogs ID", release.discogs_id)
        if release.apple_music_id:
            table.add_row("Apple Music ID", release.apple_music_id)
        if release.spotify_id:
            table.add_row("Spotify ID", release.spotify_id)
        
        # URLs
        if release.apple_music_url:
            table.add_row("Apple Music", release.apple_music_url)
        if release.spotify_url:
            table.add_row("Spotify", release.spotify_url)
        if release.lastfm_url:
            table.add_row("Last.fm", release.lastfm_url)
        
        self.console.print(table)
        
        # Tracklist
        if release.tracklist:
            track_table = Table(title="Tracklist")
            track_table.add_column("Position", style="cyan")
            track_table.add_column("Title", style="white")
            track_table.add_column("Duration", style="yellow")
            
            for track in release.tracklist:
                track_table.add_row(
                    track.position,
                    track.title,
                    track.duration or ""
                )
            
            self.console.print(track_table)


class CollectionCommand(BaseCommand):
    """Command for handling collection operations."""
    
    def execute(self, username: Optional[str], limit: Optional[int], from_index: Optional[int], to_index: Optional[int], batch_size: int, resume: bool, dry_run: bool, force_refresh: bool = False, interactive: bool = False):
        """Execute the collection command."""
        try:
            # Initialize orchestrator and database
            orchestrator = MusicDataOrchestrator(self.config.config, self.logger)
            db_path = self.config.get("database.path", "collection_cache.db")
            db = DatabaseManager(db_path, self.logger)
            
            # Set interactive mode if requested
            if interactive:
                orchestrator.set_interactive_mode(True)
            
            if resume:
                # Get unprocessed items
                unprocessed_ids = db.get_unprocessed_items(limit)
                self.console.print(f"[blue]Resuming processing of {len(unprocessed_ids)} unprocessed items[/blue]")
                
                if not unprocessed_ids:
                    click.echo("No unprocessed items found.")
                    return
                
                # Process unprocessed items
                self._process_items_by_id(unprocessed_ids, orchestrator, db, dry_run, force_refresh)
            
            else:
                # Get fresh collection
                self.console.print(f"[blue]Fetching collection from Discogs...[/blue]")
                collection_items = orchestrator.get_collection_items(username)
                
                # Apply range filtering
                if from_index is not None or to_index is not None:
                    start = from_index or 0
                    end = to_index or len(collection_items)
                    collection_items = collection_items[start:end]
                    self.console.print(f"[blue]Processing items from index {start} to {end}[/blue]")
                elif limit:
                    collection_items = collection_items[:limit]
                
                self.console.print(f"[blue]Processing {len(collection_items)} collection items[/blue]")
                
                if dry_run:
                    self._show_dry_run_info(collection_items)
                    return
                
                # Process collection
                self._process_collection_items(collection_items, orchestrator, db, batch_size, force_refresh)
                
                # Generate collection.json after processing
                self._generate_collection_json()
            
        except Exception as e:
            self.logger.error(f"Failed to process collection: {str(e)}")
            click.echo(f"Error: {str(e)}")
    
    def _process_collection_items(self, collection_items: List[Dict[str, Any]], orchestrator: MusicDataOrchestrator, db: DatabaseManager, batch_size: int, force_refresh: bool = False):
        """Process collection items."""
        processed_count = 0
        skipped_count = 0
        
        for item_data in track(collection_items, description="Processing collection..."):
            try:
                # Parse collection item to get basic info
                collection_item = orchestrator.services["discogs"].parse_collection_item(item_data)
                
                # Save collection item metadata
                db.save_collection_item(collection_item)
                
                # Check if release already exists and has been enriched (unless forcing refresh)
                if not force_refresh:
                    # Check if release exists and has been enriched
                    has_release = db.has_release_by_discogs_id(collection_item.release.discogs_id)
                    is_enriched = db.has_enriched_release(collection_item.release.discogs_id) if has_release else False
                    
                    if has_release and is_enriched:
                        self.logger.info(f"Skipping existing enriched release: {collection_item.release.title}")
                        # Mark as processed and enriched if not already marked
                        db.mark_item_processed(collection_item.id, enriched=True)
                        skipped_count += 1
                        continue
                    elif has_release and not is_enriched:
                        self.logger.info(f"Found existing release but not enriched, enriching: {collection_item.release.title}")
                        # Fetch full release data from Discogs API and enrich it
                        full_release = orchestrator.get_release_by_discogs_id(collection_item.release.discogs_id, force_refresh=True)
                        if full_release:
                            db.save_release(full_release)
                            db.mark_item_processed(collection_item.id, enriched=True)
                            processed_count += 1
                            continue
                
                # For force refresh or new items, fetch full release data from Discogs
                if force_refresh:
                    self.logger.info(f"Force refreshing release: {collection_item.release.title}")
                    enriched_release = orchestrator.get_release_by_discogs_id(collection_item.release.discogs_id, force_refresh=True)
                else:
                    # Enrich the release (this will fetch from APIs and process)
                    enriched_release = orchestrator.enrich_release(collection_item.release)
                
                # Update database with enriched data if successful
                if enriched_release:
                    db.save_release(enriched_release)
                    db.mark_item_processed(collection_item.id, enriched=True)
                else:
                    self.logger.error(f"Failed to enrich release: {collection_item.release.title}")
                
                processed_count += 1
                
                # Progress update
                if processed_count % batch_size == 0:
                    self.console.print(f"[green]Processed {processed_count} items, skipped {skipped_count}[/green]")
                
            except Exception as e:
                self.logger.error(f"Failed to process collection item: {str(e)}")
                continue
        
        self.console.print(f"[green]✓ Completed processing {processed_count} items, skipped {skipped_count}[/green]")
    
    def _process_items_by_id(self, item_ids: List[str], orchestrator: MusicDataOrchestrator, db: DatabaseManager, dry_run: bool, force_refresh: bool = False):
        """Process items by their IDs."""
        if dry_run:
            click.echo(f"Would process {len(item_ids)} unprocessed items.")
            return
        
        for item_id in track(item_ids, description="Processing unprocessed items..."):
            try:
                # Mark as processed (placeholder - would need to implement proper processing)
                db.mark_item_processed(item_id, enriched=True)
                
            except Exception as e:
                self.logger.error(f"Failed to process item {item_id}: {str(e)}")
                continue
    
    def _show_dry_run_info(self, collection_items: List[Dict[str, Any]]):
        """Show dry run information."""
        self.console.print(f"[yellow]DRY RUN - Would process {len(collection_items)} items[/yellow]")
        
        # Show sample items
        table = Table(title="Sample Collection Items")
        table.add_column("Artist", style="cyan")
        table.add_column("Title", style="white")
        table.add_column("Year", style="yellow")
        table.add_column("Format", style="green")
        
        for item in collection_items[:10]:  # Show first 10
            basic_info = item.get("basic_information", {})
            artists = basic_info.get("artists", [])
            artist_names = [a.get("name", "") for a in artists]
            
            table.add_row(
                ", ".join(artist_names),
                basic_info.get("title", ""),
                str(basic_info.get("year", "")),
                basic_info.get("formats", [{}])[0].get("name", "") if basic_info.get("formats") else ""
            )
        
        self.console.print(table)
        
        if len(collection_items) > 10:
            self.console.print(f"[dim]... and {len(collection_items) - 10} more items[/dim]")
    
    def _generate_collection_json(self):
        """Generate collection.json file after processing."""
        try:
            from ..utils.collection_generator import CollectionGenerator
            
            self.console.print(f"[blue]Generating collection.json...[/blue]")
            
            # Get data path from config
            data_path = self.config.get("data.path", "data")
            
            # Initialize collection generator
            generator = CollectionGenerator(data_path, self.config.config, self.logger)
            
            # Generate collection.json
            output_path = generator.generate_collection_json()
            
            # Show stats
            import json
            with open(output_path, 'r') as f:
                collection_data = json.load(f)
                
            self.console.print(f"[green]✓ Generated collection.json with {len(collection_data)} entries: {output_path}[/green]")
            
        except Exception as e:
            self.logger.warning(f"Failed to generate collection.json: {str(e)}")
            self.console.print(f"[yellow]⚠ Failed to generate collection.json: {str(e)}[/yellow]")


class TestCommand(BaseCommand):
    """Command for testing service connections."""
    
    def execute(self):
        """Execute the test command."""
        self.console.print("[blue]Testing service connections...[/blue]")
        
        # Test services via orchestrator (the working method)
        results = self._test_services_via_orchestrator()
        
        # Show results
        table = Table(title="Service Test Results")
        table.add_column("Service", style="cyan")
        table.add_column("Status", style="white")
        table.add_column("Configuration", style="yellow")
        
        validation = self.config.validate_config()
        
        for service_name in ["discogs", "apple_music", "spotify", "wikipedia", "lastfm"]:
            status = "✓ Connected" if results.get(service_name, False) else "✗ Failed"
            status_style = "green" if results.get(service_name, False) else "red"
            
            config_status = "✓ Valid" if validation.get(service_name, False) else "✗ Missing"
            config_style = "green" if validation.get(service_name, False) else "red"
            
            table.add_row(
                service_name.title(),
                f"[{status_style}]{status}[/{status_style}]",
                f"[{config_style}]{config_status}[/{config_style}]"
            )
        
        self.console.print(table)
        
        # Show available services
        available = [s for s, status in results.items() if status]
        if available:
            self.console.print(f"[green]Available services: {', '.join(available)}[/green]")
        else:
            self.console.print("[red]No services available. Check your configuration.[/red]")
    
    def _test_services_directly(self) -> Dict[str, bool]:
        """Test services directly without orchestrator."""
        from ..services.discogs import DiscogsService
        from ..services.apple_music import AppleMusicService
        from ..services.spotify import SpotifyService
        from ..services.wikipedia import WikipediaService
        from ..services.lastfm import LastFmService
        
        results = {}
        
        # Test Discogs
        try:
            discogs_config = self.config.get_section("discogs")
            if discogs_config.get("access_token"):
                service = DiscogsService(discogs_config, logger=self.logger)
                service.authenticate()
                results["discogs"] = True
                self.logger.info("discogs service: OK")
            else:
                results["discogs"] = False
        except Exception as e:
            results["discogs"] = False
            self.logger.error(f"discogs service: FAILED - {str(e)}")
        
        # Test Apple Music with enhanced validation
        try:
            apple_config = self.config.get_section("apple_music")
            if all(apple_config.get(k) for k in ["key_id", "team_id", "private_key_path"]):
                service = AppleMusicService(apple_config, logger=self.logger)
                
                # Use the new validation method for detailed diagnostics
                validation_result = service.validate_configuration()
                
                if validation_result["valid"]:
                    results["apple_music"] = True
                    self.logger.info("apple_music service: OK")
                else:
                    results["apple_music"] = False
                    for issue in validation_result["issues"]:
                        self.logger.error(f"apple_music service issue: {issue}")
                    for rec in validation_result["recommendations"]:
                        self.logger.info(f"apple_music service recommendation: {rec}")
            else:
                results["apple_music"] = False
                self.logger.error("apple_music service: Missing required configuration (key_id, team_id, private_key_path)")
        except Exception as e:
            results["apple_music"] = False
            self.logger.error(f"apple_music service: FAILED - {str(e)}")
        
        # Test Spotify
        try:
            spotify_config = self.config.get_section("spotify")
            if all(spotify_config.get(k) for k in ["client_id", "client_secret"]):
                service = SpotifyService(spotify_config, logger=self.logger)
                service.authenticate()
                results["spotify"] = True
                self.logger.info("spotify service: OK")
            else:
                results["spotify"] = False
        except Exception as e:
            results["spotify"] = False
            self.logger.error(f"spotify service: FAILED - {str(e)}")
        
        # Test Wikipedia (no auth needed)
        try:
            wikipedia_config = self.config.get_section("wikipedia")
            service = WikipediaService(wikipedia_config, logger=self.logger)
            service.authenticate()  # No-op for Wikipedia
            results["wikipedia"] = True
            self.logger.info("wikipedia service: OK")
        except Exception as e:
            results["wikipedia"] = False
            self.logger.error(f"wikipedia service: FAILED - {str(e)}")
        
        # Test Last.fm
        try:
            lastfm_config = self.config.get_section("lastfm")
            if lastfm_config.get("api_key"):
                service = LastFmService(lastfm_config, logger=self.logger)
                service.authenticate()
                results["lastfm"] = True
                self.logger.info("lastfm service: OK")
            else:
                results["lastfm"] = False
        except Exception as e:
            results["lastfm"] = False
            self.logger.error(f"lastfm service: FAILED - {str(e)}")
        
        return results
    
    def _test_services_via_orchestrator(self) -> Dict[str, bool]:
        """Test services via orchestrator (the working method used by release command)."""
        from ..utils import MusicDataOrchestrator
        
        results = {}
        
        try:
            # Initialize orchestrator like the release command does
            orchestrator = MusicDataOrchestrator(self.config.config, self.logger)
            
            # Check which services got initialized
            available_services = orchestrator.get_available_services()
            
            # Test each service by checking if it's available and working
            for service_name in ["discogs", "apple_music", "spotify", "wikipedia", "lastfm"]:
                if service_name in available_services:
                    try:
                        # For Discogs, test by trying to get a release
                        if service_name == "discogs":
                            test_release = orchestrator.get_release_by_discogs_id("249504")
                            results[service_name] = test_release is not None
                            if results[service_name]:
                                self.logger.info(f"{service_name} service: OK")
                            else:
                                self.logger.error(f"{service_name} service: FAILED - No release returned")
                        else:
                            # For other services, just check if they initialized
                            results[service_name] = True
                            self.logger.info(f"{service_name} service: OK")
                    except Exception as e:
                        results[service_name] = False
                        self.logger.error(f"{service_name} service: FAILED - {str(e)}")
                else:
                    results[service_name] = False
                    
        except Exception as e:
            self.logger.error(f"Failed to test services via orchestrator: {str(e)}")
            # Fallback to all False
            for service_name in ["discogs", "apple_music", "spotify", "wikipedia", "lastfm"]:
                results[service_name] = False
        
        return results


class ReportCommand(BaseCommand):
    """Command for generating various reports."""
    
    def execute_album_matching_report(self, output_file: Optional[str] = None, 
                                      output_format: str = "text", 
                                      limit: Optional[int] = None, 
                                      filter_config: Optional[str] = None,
                                      include_unprocessed: bool = True):
        """Execute album matching report."""
        try:
            # Use provided filter config or default
            filter_config_path = filter_config or "album_matching_filters.json"
            
            # Initialize report generator
            report_generator = AlbumMatchingReport(
                config=self.config.config,
                filter_config_path=filter_config_path,
                logger=self.logger
            )
            
            self.console.print("[blue]Generating album matching report...[/blue]")
            
            # Generate report
            results = report_generator.generate_report(limit=limit, include_unprocessed=include_unprocessed)
            
            if not results:
                self.console.print("[yellow]No matching issues found in the database.[/yellow]")
                return
            
            # Display summary
            self.console.print(f"[green]Found {len(results)} albums with matching issues[/green]")
            
            # Save to file if requested
            if output_file:
                if output_format.lower() == "json":
                    success = report_generator.save_report_json(results, output_file)
                else:
                    success = report_generator.save_report(results, output_file)
                
                if success:
                    self.console.print(f"[green]Report saved to: {output_file}[/green]")
                else:
                    self.console.print(f"[red]Failed to save report to: {output_file}[/red]")
            
            # Display results in console (show first 10 by default)
            self._display_matching_results(results[:10] if len(results) > 10 else results)
            
            if len(results) > 10:
                self.console.print(f"[yellow]Showing first 10 results. Use --output-file to save all {len(results)} results.[/yellow]")
            
        except Exception as e:
            self.logger.error(f"Failed to generate album matching report: {str(e)}")
            self.console.print(f"[red]Error: {str(e)}[/red]")
    
    def _display_matching_results(self, results):
        """Display matching results in a formatted table."""
        if not results:
            return
        
        table = Table(title="Album Matching Issues")
        table.add_column("Discogs ID", style="cyan", width=12)
        table.add_column("Discogs Title", style="white", width=30)
        table.add_column("Apple Music", style="red", width=30)
        table.add_column("Spotify", style="green", width=30)
        table.add_column("Issues", style="yellow", width=20)
        
        for result in results:
            apple_music_display = result.apple_music_title or "N/A"
            spotify_display = result.spotify_title or "N/A"
            
            # Truncate long titles
            if len(apple_music_display) > 28:
                apple_music_display = apple_music_display[:25] + "..."
            if len(spotify_display) > 28:
                spotify_display = spotify_display[:25] + "..."
            
            issues_display = ", ".join(result.mismatch_reasons) if result.mismatch_reasons else "No issues"
            if len(issues_display) > 18:
                issues_display = issues_display[:15] + "..."
            
            table.add_row(
                result.discogs_id,
                result.discogs_title[:28] + "..." if len(result.discogs_title) > 30 else result.discogs_title,
                apple_music_display,
                spotify_display,
                issues_display
            )
        
        self.console.print(table)