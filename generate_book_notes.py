import json
import os

# Load books.json
with open('books.json', 'r', encoding='utf-8') as f:
    books = json.load(f)

# Template for the editor's note
def generate_note(book):
    title = book['title']
    category = book['category']
    subcat = book.get('subcat', '')
    pages = book['pages']
    
    # Determine key topics based on category and subcategory
    topics = {
        'Biochemistry': 'protein structure, enzyme kinetics, metabolic pathways (glycolysis, TCA cycle, oxidative phosphorylation), DNA replication, transcription, translation, and clinical correlations',
        'Genetics': 'Mendelian inheritance, chromosomal abnormalities, molecular genetics, epigenetics, genetic counselling, and common disorders',
        'Immunology': 'innate and adaptive immunity, antigens, antibodies, MHC, T‑cell and B‑cell development, hypersensitivity, autoimmunity, and vaccines',
        'Microbiology': 'bacteriology, virology, mycology, parasitology, pathogenicity, antimicrobial agents, and infectious disease mechanisms',
        'General Pathology': 'cell injury, inflammation, repair, haemodynamic disorders, neoplasia, immunopathology, and environmental diseases',
        'General Pharmacology': 'pharmacokinetics, pharmacodynamics, drug receptors, drug metabolism, adverse effects, and principles of therapeutics',
        'Research': 'study designs, data collection, statistical tests, evidence‑based medicine, and research ethics',
        'Respiratory': 'lung anatomy, ventilation, gas exchange, V/Q mismatch, obstructive and restrictive lung diseases, pulmonary infections, and respiratory pharmacology',
        'Cardiology': 'cardiac anatomy, electrophysiology, haemodynamics, ischaemic heart disease, heart failure, arrhythmias, valvular diseases, and cardiovascular pharmacology',
        'Neurology': 'neuroanatomy, neurophysiology, stroke, seizures, neurodegenerative diseases, demyelinating disorders, neuromuscular diseases, and neuropharmacology',
        'Gastroenterology': 'GI anatomy, motility, secretion, digestion, absorption, liver function, pancreatic function, GI infections, inflammatory bowel disease, and GI pharmacology',
        'Endocrinology': 'hormone synthesis, regulation, feedback loops, diabetes mellitus, thyroid disorders, adrenal disorders, pituitary disorders, and endocrine pharmacology',
        'Renal': 'kidney anatomy, glomerular filtration, tubular function, acid‑base balance, electrolyte regulation, acute and chronic kidney disease, and renal pharmacology',
        'Reproductive': 'male and female reproductive anatomy, gametogenesis, menstrual cycle, pregnancy, parturition, lactation, contraception, infertility, STIs, and reproductive pharmacology',
        'Musculoskeletal': 'bone and joint anatomy, muscle physiology, osteoporosis, arthritis, muscle disorders, and pharmacology (NSAIDs, DMARDs, bisphosphonates)',
        'Hematology': 'blood cell formation, anaemias, leukaemias, lymphomas, bleeding disorders, thrombosis, and haematological pharmacology',
        'Dermatology': 'skin anatomy, inflammatory skin diseases, infections, neoplasms, and dermatological pharmacology',
        'Psychiatry': 'mood disorders, anxiety disorders, psychotic disorders, personality disorders, substance abuse, and psychopharmacology',
        'Ophthalmology': 'eye anatomy, common disorders (cataracts, glaucoma), and treatment options',
        'Pediatrics': 'growth and development, paediatric infections, congenital disorders, child nutrition, and paediatric pharmacology',
        'Emergency': 'trauma, resuscitation, acute poisoning, medical emergencies, and emergency pharmacology',
        'Toxicology': 'poisoning mechanisms, antidotes, overdose management, and environmental toxins',
        'Clinical Skills': 'physical examination, history taking, diagnostic reasoning, and procedural skills',
        'Nutrition': 'macronutrients, micronutrients, vitamins, minerals, nutritional disorders, and metabolic diseases',
        'Question Bank': 'high‑yield USMLE‑style multiple‑choice questions with detailed explanations'
    }
    
    default_topics = 'core concepts and clinical correlations essential for medical education'
    topic_text = topics.get(category, default_topics)
    
    note = f"""<div style="background: #f0f7ff; border-left: 6px solid #2c7cb0; padding: 1.5rem; margin-bottom: 2rem; border-radius: 16px;">
    <h2 style="color: #0a2942;">📘 Editor's Note: {title}</h2>
    <p>This textbook was compiled by <strong>Abubakar Sadeeq</strong> to help medical students master the essential concepts of <strong>{category}</strong> {'– ' + subcat if subcat else ''}. It follows the curriculum commonly used in US medical schools and integrates high‑yield topics for USMLE Step 1 and Step 2 CK preparation.</p>
    <p><strong>Key topics covered:</strong> {topic_text}.</p>
    <p>Each section includes clinical correlations to help you apply theoretical knowledge to patient care. Use the interactive sidebar to navigate chapters, and click any term to search within the book.</p>
    <p>If you have questions, highlight any text and click "Ask Nexus" – the AI assistant will explain further.</p>
</div>"""
    return note

# Generate notes for all books
for book in books:
    note = generate_note(book)
    filename = book['filename']
    print(f"// ===== Editor's Note for {filename} =====\n")
    print(note)
    print("\n")
