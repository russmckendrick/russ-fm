"""Setup script for Music Collection Manager."""

from setuptools import setup, find_packages
from pathlib import Path

# Read the README file
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding="utf-8") if (this_directory / "README.md").exists() else ""

# Read requirements
requirements_path = this_directory / "requirements.txt"
if requirements_path.exists():
    with open(requirements_path) as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]
else:
    requirements = [
        "requests>=2.31.0",
        "click>=8.1.0",
        "PyJWT>=2.8.0",
        "cryptography>=41.0.0",
        "pyyaml>=6.0",
        "rich>=13.0.0",
        "python-dateutil>=2.8.0",
    ]

setup(
    name="music-collection-manager",
    version="0.1.0",
    description="A modern tool for managing music collections with data from multiple sources",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Your Name",
    author_email="your.email@example.com",
    url="https://github.com/yourusername/music-collection-manager",
    packages=find_packages(),
    include_package_data=True,
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.5.0",
        ],
        "discogs": [
            "python3-discogs-client>=2.5.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "music-collection-manager=music_collection_manager.cli.main:main",
            "mcm=music_collection_manager.cli.main:main",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: End Users/Desktop",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Multimedia :: Sound/Audio",
        "Topic :: Database",
    ],
    python_requires=">=3.8",
    keywords="music collection discogs apple-music spotify lastfm wikipedia",
)