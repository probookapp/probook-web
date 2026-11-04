import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * The publisher's individual attestation for a cash system, laid out after the
 * administration's model (BOI-LETTRE-000242): part 1 filled in by the
 * publisher, part 2 completed and signed by the merchant. It is worth nothing
 * until part 2 is signed, and both parts are shown together on an audit.
 *
 * Always in French: it is a French tax document addressed to the French
 * administration.
 */
export interface AttestationData {
  editor: { company: string; representative: string; city: string; market_date: string };
  software: { name: string; majorVersion: string; version: string };
  merchant: {
    company: string;
    representative: string;
    address: string;
    siret: string;
    acquired_at: string | null;
    used_since: string | null;
  };
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 44, paddingBottom: 40, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.45 },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 9, textAlign: "center", color: "#635e56", marginBottom: 14 },
  note: { fontSize: 8.5, color: "#4a4640", marginBottom: 12, padding: 8, backgroundColor: "#f2f0ed" },
  part: { borderWidth: 1, borderColor: "#d1ccc4", borderRadius: 4, padding: 12, marginBottom: 14 },
  partTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 8 },
  paragraph: { marginBottom: 6 },
  strong: { fontWeight: "bold" },
  signature: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  signatureBox: { width: "48%" },
  signatureArea: { borderWidth: 1, borderColor: "#d1ccc4", height: 54, borderRadius: 4, marginTop: 4 },
  warning: { fontSize: 8, color: "#7a2b28", marginTop: 8 },
});

const frDate = (iso: string | null | undefined): string => {
  if (!iso) return "…………………";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
};

const blank = (value: string | null | undefined) => (value && value.trim() ? value : "…………………………………");

const FALSE_ATTESTATION =
  "Il est rappelé que l'établissement d'une fausse attestation est un délit pénal passible de trois ans d'emprisonnement et de 45 000 € d'amende (article 441-1 du code pénal).";

export function AttestationPDF({ data }: { data: AttestationData }) {
  const { editor, software, merchant } = data;
  return (
    <Document title={`Attestation individuelle : ${software.name} ${software.version}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>ATTESTATION INDIVIDUELLE</Text>
        <Text style={styles.subtitle}>
          relative à l&apos;obligation prévue au 3° bis du I de l&apos;article 286 du code général des impôts
          {"\n"}(modèle BOI-LETTRE-000242)
        </Text>
        <Text style={styles.note}>
          Les volets 1 et 2 doivent être présentés ensemble en cas de contrôle. Cette attestation n&apos;a de
          valeur que si son volet 2 est dûment complété et signé par l&apos;entreprise utilisatrice.
        </Text>

        <View style={styles.part}>
          <Text style={styles.partTitle}>Volet 1 : à remplir par l&apos;éditeur</Text>
          <Text style={styles.paragraph}>
            Je soussigné(e), <Text style={styles.strong}>{editor.representative}</Text>, représentant légal de la
            société <Text style={styles.strong}>{editor.company}</Text>, éditeur du logiciel de caisse{" "}
            <Text style={styles.strong}>{software.name}</Text>,
          </Text>
          <Text style={styles.paragraph}>
            atteste que les fonctionnalités de caisse de ce logiciel, mis sur le marché à compter du{" "}
            {frDate(editor.market_date)}, dans sa version n° {software.version}, satisfont aux conditions
            d&apos;inaltérabilité, de sécurisation, de conservation et d&apos;archivage des données en vue du contrôle
            de l&apos;administration fiscale, prévues au 3° bis du I de l&apos;article 286 du code général des impôts.
          </Text>
          <Text style={styles.paragraph}>
            J&apos;atteste que la dernière version majeure de ce logiciel est identifiée avec la racine suivante :{" "}
            {software.majorVersion}, et que les versions mineures sont identifiées sous la forme{" "}
            {software.majorVersion}.x. Je m&apos;engage à n&apos;utiliser ces subdivisions que pour des versions
            mineures.
          </Text>
          <Text style={styles.paragraph}>
            Le périmètre couvert par cette attestation concerne les fonctionnalités suivantes : enregistrement des
            ventes en caisse, de leurs annulations et remboursements, et des encaissements de factures ; journal
            chaîné et scellé ; clôtures journalières, mensuelles et annuelles avec grand total de période et total
            perpétuel ; génération d&apos;archives signées.
          </Text>
          <Text style={styles.paragraph}>
            Les fonctionnalités suivantes ne sont pas couvertes par cette attestation : les ventes saisies hors
            connexion, tant qu&apos;elles n&apos;ont pas été synchronisées avec le serveur.
          </Text>
          <View style={styles.signature}>
            <View style={styles.signatureBox}>
              <Text>Fait à {editor.city}, le …………………</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text>Signature du représentant légal de l&apos;éditeur</Text>
              <View style={styles.signatureArea} />
            </View>
          </View>
          <Text style={styles.warning}>{FALSE_ATTESTATION}</Text>
        </View>

        <View style={styles.part} wrap={false}>
          <Text style={styles.partTitle}>Volet 2 : à remplir par l&apos;entreprise utilisatrice</Text>
          <Text style={styles.paragraph}>
            Je soussigné(e), <Text style={styles.strong}>{blank(merchant.representative)}</Text>, représentant légal
            de la société <Text style={styles.strong}>{blank(merchant.company)}</Text>
            {merchant.siret ? ` (SIRET ${merchant.siret})` : ""}
            {merchant.address ? `, ${merchant.address}` : ""},
          </Text>
          <Text style={styles.paragraph}>
            certifie avoir acquis ou téléchargé le {frDate(merchant.acquired_at)}, auprès de {editor.company}, le
            logiciel de caisse mentionné au volet 1.
          </Text>
          <Text style={styles.paragraph}>
            J&apos;atteste utiliser ce logiciel de caisse pour enregistrer les règlements de mes clients
            particuliers depuis le {frDate(merchant.used_since)}.
          </Text>
          <View style={styles.signature}>
            <View style={styles.signatureBox}>
              <Text>Fait à ……………………, le …………………</Text>
            </View>
            <View style={styles.signatureBox}>
              <Text>Signature du représentant légal de l&apos;entreprise</Text>
              <View style={styles.signatureArea} />
            </View>
          </View>
          <Text style={styles.warning}>{FALSE_ATTESTATION}</Text>
        </View>
      </Page>
    </Document>
  );
}
