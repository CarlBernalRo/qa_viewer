// En release no se abre una consola extra en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rastro_desktop_lib::run()
}
