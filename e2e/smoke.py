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

        # 4. Studio & CMS V3.0 (11 modules + Licences Relances + Grand Reset & Mode Démo)
        page.click("header button:has-text('Studio & CMS')")
        page.wait_for_selector("text=Explorateur & Modules CMS (11)", timeout=12000)
        page.click("button:has-text('Vente & Gestion des Licences')")
        page.wait_for_selector("text=Alertes Automatiques & Relances Licences", timeout=8000)
        page.click("button:has-text('Remise à Zéro Production')")
        page.wait_for_selector("text=Grand Reset Plateforme & Mode Démo Réversible", timeout=8000)

        # 5. Robot Humanoïde Guide Interactif + Manuel Utilisateur PDF (HTTP 200)
        page.click("[data-guide-tag='robot-launcher-btn']")
        page.wait_for_selector("role=dialog[name='Assistant robot guide SIGAMP-CM']", timeout=8000)
        page.click("button:has-text('Suivant')")
        page.wait_for_timeout(400)
        pdf_resp = page.request.get(f"{BASE_URL}/docs/SIGAMP_CM_Manuel_Utilisateur_Complet.pdf")
        assert pdf_resp.status == 200, f"PDF manual status {pdf_resp.status}"
        assert len(pdf_resp.body()) > 50000, "PDF manual unexpectedly small"

        browser.close()
        print("E2E SMOKE TEST SUITE PASSED (Login, Supabase Projects/Deliverables, GED Auto-Seal, Document Factory Studio Header, 11-Module CMS, License Relances, Grand Reset/Demo Toggle, Humanoid Robot & PDF Manual)!")
        return 0


if __name__ == "__main__":
    sys.exit(main())
