const supabase = require('../config/supabase');

class Contact {
  static async create(contactData) {
    const { data, error } = await supabase
      .from('contacts')
      .insert([contactData])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async findBySessionId(sessionId, status = null) {
    let query = supabase
      .from('contacts')
      .select('*')
      .eq('session_id', sessionId);
    
    if (status) {
      query = query.eq('conversation_status', status);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  static async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('contacts')
      .update({ conversation_status: status, updated_at: new Date() })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async findByNumber(sessionId, number) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('number', number)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async update(id, contactData) {
    const { data, error } = await supabase
      .from('contacts')
      .update(contactData)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async upsert(contactData) {
    // Tenta encontrar o contato existente
    const existingContact = await this.findByNumber(contactData.session_id, contactData.number);
    
    if (existingContact) {
      // Atualiza o contato existente
      return this.update(existingContact.id, contactData);
    } else {
      // Cria um novo contato
      return this.create(contactData);
    }
  }
}

module.exports = Contact;
