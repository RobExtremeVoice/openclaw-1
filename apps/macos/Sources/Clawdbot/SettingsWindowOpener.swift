import AppKit
import SwiftUI

@MainActor
final class SettingsWindowOpener {
    static let shared = SettingsWindowOpener()

    private var openSettingsAction: OpenSettingsAction?

    func register(openSettings: OpenSettingsAction) {
        self.openSettingsAction = openSettings
    }

    func open() {
        NSApp.activate(ignoringOtherApps: true)
        if let openSettingsAction {
            openSettingsAction()
            return
        }

        // Fallback path: mimic the built-in Settings menu item action.
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}

