# Run Zen-it-trix on Windows with Docker Desktop

## Requirements

Install Docker Desktop for Windows and enable the WSL 2 backend during installation.

## Start the application

Open PowerShell in the project folder:

```powershell
docker compose up --build
```

Open the website at:

```text
http://localhost:8080
```

Open the admin panel at:

```text
http://localhost:8080/#admin
```

Admin credentials:

```text
Username: admin
Password: admin@zen-ti-trix-2
```

The backend API is available at `http://localhost:4000`. The MariaDB data is stored in the Docker volume `zen_it_trix_v2_database_data`.

## Stop the application

Press `Ctrl+C` in PowerShell, or run:

```powershell
docker compose down
```

The database volume is kept when containers stop. To remove the containers and database data permanently:

```powershell
docker compose down -v
```

## Troubleshooting

View service logs:

```powershell
docker compose logs -f backend
```

If you change environment values or Dockerfiles, rebuild:

```powershell
docker compose up --build
```
