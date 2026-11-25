import os
import sys
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("SIGAMP_E2E_URL", "http://127.0.0.1:3010")
LOGIN_ENTITY = os.environ.get("SIGAMP_E2E_ENTITY", "TIT-CS-ADMIN")
LOGIN_USER = os.environ.get("SIGAMP_E2E_USER", "jolotus")
LOGIN_PASS = os.environ.get("SIGAMP_E2E_PASS", "Dumas@1234&$#")


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # 1. Authentification liée à l'entité
        page.goto(f"{BASE_URL}/login", wait_until="networkidle")
        select = page.locator("select").first
        val = select.locator("option", has_text=LOGIN_ENTITY).get_attribute("value")
        assert val, f"Entity option {LOGIN_ENTITY} not found"
        select.select_option(val)
        page.fill("#email", LOGIN_USER)
        page.fill("#password", LOGIN_PASS)
        page.click("button[type='submit']")

        page.wait_for_url(f"{BASE_URL}/", timeout=15000)
        page.wait_for_selector(
            "text=Vérification de la session Supabase Auth",
            state="detached",
            timeout=15000,
        )
        page.wait_for_timeout(800)

        # 2. Chaîne de Valeur + Orchestrateur Maturation + Persistance Supabase
        page.wait_for_selector("text=Sauvegarder Dossier Supabase", timeout=10000)
        body_text = page.locator("body").inner_text()
        assert "MOTEUR D’ORCHESTRATION PROCÉDURALE" in body_text.upper()
        page.click("button:has-text('Sauvegarder Dossier Supabase')")
        page.wait_for_selector("text=Sauvegardé Supabase", timeout=12000)

        # Transition d'un livrable vers SIGNÉ & ARCHIVÉ GED (idempotent même si déjà scellé)
        page.locator("text=Moteur d’Orchestration Procédurale").scroll_into_view_if_needed()
        first_status = page.locator("table tbody tr select").first
        if first_status.input_value() == "SIGNE_ARCHIVE_GED":
            first_status.select_option("EN_REDACTION")
            page.wait_for_timeout(400)
        first_status.select_option("SIGNE_ARCHIVE_GED")
        page.wait_for_selector("text=archivé et scellé dans la GED Régalienne", timeout=12000)

        # 3. Usine Documentaire 44 Actes & DTAO (vérification badge Gabarit Studio)
        page.click("header button:has-text('44 Actes')")
        page.wait_for_selector("text=Gabarit Studio injecté", timeout=12000)

        # 4. Studio & CMS V3.0 (11 modules + Header Bilingue/Centré)
        page.click("header button:has-text('Studio & CMS')")
        page.wait_for_selector("text=Explorateur & Modules CMS (11)", timeout=12000)

        browser.close()
        print("E2E SMOKE TEST SUITE PASSED (Login, Supabase Projects/Deliverables, GED Auto-Seal, Document Factory Studio Header, 11-Module CMS)!")
        return 0


if __name__ == "__main__":
    sys.exit(main())
