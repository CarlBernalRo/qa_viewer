//! Arranque, supervisión y apagado del proceso del backend (Node).

use serde::Serialize;
use std::io;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

/// Orígenes desde los que el webview llama al backend (dev y producción).
const ALLOWED_ORIGINS: &str =
    "http://127.0.0.1:5173,http://localhost:5173,tauri://localhost,http://tauri.localhost";

/// Si el backend se cae más veces que esto, se deja de reiniciar (algo está roto de verdad).
const MAX_RESTARTS: u32 = 5;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
    pub url: String,
    pub token: String,
}

/// Si están definidas `RASTRO_EXTERNAL_BACKEND_URL` y `RASTRO_EXTERNAL_BACKEND_TOKEN`,
/// Tauri usa ese backend en lugar de lanzar uno propio.
pub fn external_from_env() -> Option<BackendConfig> {
    let url = std::env::var("RASTRO_EXTERNAL_BACKEND_URL").ok()?;
    let token = std::env::var("RASTRO_EXTERNAL_BACKEND_TOKEN").ok()?;
    Some(BackendConfig { url, token })
}

fn free_port() -> io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn new_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// Carpeta `backend/` del monorepo. En la etapa 1 el backend corre desde el repo;
/// empaquetarlo junto al instalador es un paso posterior.
fn backend_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("backend")
}

/// Todo lo necesario para (re)lanzar el backend con la misma URL y el mismo token.
struct LaunchSpec {
    port: u16,
    token: String,
    data_dir: PathBuf,
}

impl LaunchSpec {
    fn launch(&self) -> io::Result<Child> {
        let node = std::env::var("RASTRO_NODE_BIN").unwrap_or_else(|_| "node".into());
        let mut command = Command::new(node);
        if cfg!(debug_assertions) {
            // Desarrollo: TypeScript directo con tsx, leyendo @rastro/shared desde su código.
            command.args(["--conditions=source", "--import", "tsx", "src/main.ts"]);
        } else {
            command.arg("dist/main.js");
        }
        command
            .current_dir(backend_dir())
            .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
            .env("RASTRO_HOST", "127.0.0.1")
            .env("RASTRO_PORT", self.port.to_string())
            .env("RASTRO_AUTH_TOKEN", &self.token)
            .env("RASTRO_DATA_DIR", &self.data_dir)
            .env("RASTRO_ALLOWED_ORIGINS", ALLOWED_ORIGINS)
            .env("RASTRO_PARENT_PID", std::process::id().to_string())
            .stdin(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        command.spawn()
    }
}

struct Inner {
    spec: LaunchSpec,
    child: Option<Child>,
    stopping: bool,
    restarts: u32,
}

/// Lanza el backend y lo vuelve a lanzar si termina de forma inesperada.
pub struct BackendSupervisor {
    pub config: BackendConfig,
    inner: Arc<Mutex<Inner>>,
}

impl BackendSupervisor {
    pub fn start(data_dir: &Path) -> io::Result<Self> {
        let spec = LaunchSpec {
            port: free_port()?,
            token: new_token(),
            data_dir: data_dir.to_path_buf(),
        };
        let config = BackendConfig {
            url: format!("http://127.0.0.1:{}", spec.port),
            token: spec.token.clone(),
        };
        let child = spec.launch()?;
        let inner = Arc::new(Mutex::new(Inner {
            spec,
            child: Some(child),
            stopping: false,
            restarts: 0,
        }));

        let watched = Arc::clone(&inner);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(1));
            let Ok(mut guard) = watched.lock() else { break };
            if guard.stopping {
                break;
            }
            let exited = match guard.child.as_mut() {
                Some(child) => matches!(child.try_wait(), Ok(Some(_))),
                None => true,
            };
            if !exited {
                continue;
            }
            if guard.restarts >= MAX_RESTARTS {
                eprintln!("[rastro] el backend terminó {MAX_RESTARTS} veces; no se reinicia más.");
                guard.child = None;
                break;
            }
            guard.restarts += 1;
            eprintln!(
                "[rastro] el backend terminó de forma inesperada; reiniciando (intento {}).",
                guard.restarts
            );
            guard.child = guard.spec.launch().ok();
        });

        Ok(Self { config, inner })
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.stopping = true;
            if let Some(mut child) = guard.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
