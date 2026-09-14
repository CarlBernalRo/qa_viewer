//! Contenedor de escritorio de Rastro.
//!
//! Al arrancar genera un token aleatorio, elige un puerto libre en loopback y
//! lanza el backend de Node con esa configuración (y lo reinicia si se cae).
//! El frontend obtiene la URL y el token con el comando `get_backend_config`;
//! nunca quedan en el bundle.

mod backend;

use backend::{BackendConfig, BackendSupervisor};
use tauri::{Manager, RunEvent};

struct BackendState {
    config: BackendConfig,
    supervisor: Option<BackendSupervisor>,
}

#[tauri::command]
fn get_backend_config(state: tauri::State<'_, BackendState>) -> BackendConfig {
    state.config.clone()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let (config, supervisor) = match backend::external_from_env() {
                // Backend levantado aparte (npm run dev:backend): no se lanza otro.
                Some(config) => (config, None),
                None => {
                    let data_dir = app.path().app_data_dir()?.join("data");
                    std::fs::create_dir_all(&data_dir)?;
                    let supervisor = BackendSupervisor::start(&data_dir)?;
                    (supervisor.config.clone(), Some(supervisor))
                }
            };
            app.manage(BackendState { config, supervisor });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_config])
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar la aplicación de Tauri")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<BackendState>() {
                    if let Some(supervisor) = &state.supervisor {
                        supervisor.stop();
                    }
                }
            }
        });
}
