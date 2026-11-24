import type { Action, Charter, Mention, PageRef, TeiNode } from "../../shared/types"
import {
    attr,
    child,
    children,
    descendants,
    hoistLineBreaks,
    joinBrokenWords,
    path,
    plainText,
    text,
    toTree,
    trimNodes,
    xmlId,
    xmlLang,
    type El,
} from "./tei"

export interface CharterContext {
    file: string
    collection: string
    id: string
    issue: (level: "error" | "warning", message: string) => void
}

const tree = (el: El | undefined, ctx: CharterContext): TeiNode[] =>
    el ? hoistLineBreaks(joinBrokenWords(trimNodes(toTree(el, (a, raw) => checkRef(a, raw, ctx))))) : []

function checkRef(attrName: string, raw: string, ctx: CharterContext) {
    if (attrName !== "ref" && attrName !== "facs") return
    for (const tok of raw.trim().split(/\s+/)) {
        if (tok && !tok.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(tok))
            ctx.issue("warning", `@${attrName}="${tok}" has no leading '#'`)
    }
}

export function parseCharter(tei: El, ctx: CharterContext): Charter {
    const fileDesc = path(tei, "teiHeader", "fileDesc")
    const msDesc = path(fileDesc, "sourceDesc", "msDesc")
    const msIdent = child(msDesc, "msIdentifier")
    const msPart = child(msDesc, "msPart")
    const msItem = path(msPart, "msContents", "msItem")
    const docDate = child(msItem, "docDate")
    const locus = child(msItem, "locus")
    const physDesc = child(msDesc, "physDesc")

    // --- facsimile -----------------------------------------------------------
    const pages: PageRef[] = children(child(tei, "facsimile"), "surface").map((s) => {
        const id = xmlId(s) ?? ""
        return { id, label: id.replace(/^f-/, ""), image: attr(child(s, "graphic"), "url") ?? "" }
    })
    const pageIds = new Set(pages.map((p) => p.id))

    // --- body ----------------------------------------------------------------
    const bodyEl = path(tei, "text", "body")
    const body = tree(bodyEl, ctx)

    if (bodyEl) {
        for (const pb of descendants(bodyEl, "pb")) {
            const facs = attr(pb, "facs")?.replace(/^#/, "")
            if (facs && !pageIds.has(facs))
                ctx.issue("error", `<pb n="${attr(pb, "n")}" facs="${attr(pb, "facs")}"> points to a missing <surface>`)
        }
        // duplicate line numbers per page
        let page = ""
        const seen = new Set<string>()
        const walk = (el: El) => {
            for (const c of children(el)) {
                if (c.localName === "pb") page = attr(c, "n") ?? page
                if (c.localName === "lb" && attr(c, "n")) {
                    const key = `${page}/${attr(c, "n")}`
                    if (seen.has(key)) ctx.issue("warning", `duplicate <lb n="${attr(c, "n")}"> on page ${page}`)
                    seen.add(key)
                }
                walk(c)
            }
        }
        walk(bodyEl)
    }

    // --- notes ---------------------------------------------------------------
    const notes: Record<string, TeiNode[]> = {}
    for (const so of children(tei, "standOff")) {
        for (const note of children(child(so, "listAnnotation"), "note")) {
            const target = attr(note, "corresp")?.replace(/^#/, "")
            if (target) notes[target] = tree(note, ctx)
        }
    }

    const { mentions, actions } = collectMentions(body)

    for (const id of Object.keys(notes)) {
        if (!JSON.stringify(body).includes(`"xml:id":"${id}"`))
            ctx.issue("warning", `note for #${id} has no anchor in the text`)
    }

    return {
        id: ctx.id,
        collection: ctx.collection,
        bookId: slug(text(child(msIdent, "idno")) || "unknown"),
        number: text(path(msPart, "msIdentifier", "idno")),
        altNumber: text(path(msPart, "msIdentifier", "altIdentifier", "idno")) || undefined,
        title: text(path(fileDesc, "titleStmt", "title")),
        date: {
            when: attr(docDate, "when"),
            from: attr(docDate, "from"),
            to: attr(docDate, "to"),
        },
        locus: { from: attr(locus, "from"), to: attr(locus, "to") },
        language: text(child(msItem, "textLang")) || (bodyEl ? xmlLang(bodyEl) : undefined),
        summary: tree(path(msPart, "msContents", "summary"), ctx),
        manuscript: {
            country: text(child(msIdent, "country")) || undefined,
            settlement: text(child(msIdent, "settlement")) || undefined,
            repository: text(child(msIdent, "repository")) || undefined,
            idno: text(child(msIdent, "idno")) || undefined,
            name: text(child(msIdent, "msName")) || undefined,
            altIdno: text(path(msIdent, "altIdentifier", "idno")) || undefined,
        },
        edition: {
            publication: tree(path(fileDesc, "publicationStmt"), ctx),
            resp: children(path(fileDesc, "titleStmt"), "respStmt").map((r) => ({
                resp: text(child(r, "resp")) || undefined,
                name: text(child(r, "name")) || undefined,
                key: attr(child(r, "name"), "key"),
            })),
            funder: child(path(fileDesc, "titleStmt"), "funder")
                ? {
                      name: text(child(path(fileDesc, "titleStmt"), "funder")),
                      ref: attr(child(path(fileDesc, "titleStmt"), "funder"), "ref"),
                  }
                : undefined,
        },
        physDesc: {
            hand: text(path(physDesc, "handDesc", "handNote")) || undefined,
            script: tree(path(physDesc, "scriptDesc", "scriptNote"), ctx),
            decoration: children(child(physDesc, "decoDesc"), "decoNote").map((d) => ({
                type: attr(d, "type"),
                note: tree(d, ctx),
            })),
            additions: tree(child(physDesc, "additions"), ctx),
        },
        pages,
        body,
        notes,
        mentions, // kind is resolved later against the indices
        actions,
        plainText: plainText(body),
    }
}

/** Walks the body tree: rs[@ref] -> mentions, rs[@type] -> actions. */
function collectMentions(body: TeiNode[]) {
    const mentions: Mention[] = []
    const actions: Action[] = []
    const walk = (nodes: TeiNode[], section?: string) => {
        for (const n of nodes) {
            if (typeof n === "string") continue
            const sec = n.t === "head" ? "head" : n.t === "ab" && n.a?.type ? n.a.type : section
            if (n.t === "rs") {
                for (const ref of (n.a?.ref ?? "").split(/\s+/).filter(Boolean))
                    mentions.push({ ref, kind: "unresolved", role: n.a?.role, section: sec })
                if (n.a?.type) actions.push({ types: n.a.type.split(/\s+/), section: sec, text: plainText(n.c ?? []) })
            }
            if (n.c) walk(n.c, sec)
        }
    }
    walk(body)
    return { mentions, actions }
}

export const slug = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "")
