const supabase = require('../config/supabase');

class Message {
  static async create(messageData) {
    const { data, error } = await supabase
      .from('messages')
      .insert([messageData])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  static async findBySessionId(sessionId, limit = 100) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  static async findConversation(sessionId, contactNumber, limit) {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .or(`from_number.eq.${contactNumber},to_number.eq.${contactNumber}`)
      .order('timestamp', { ascending: false });

    if (typeof limit === 'number' && limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  static async markAsRead(id) {
    const { data, error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async markAllAsRead(sessionId, contactNumber) {
    const { data, error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('session_id', sessionId)
      .eq('from_number', contactNumber)
      .eq('is_read', false)
      .select();
    
    if (error) throw error;
    return data;
  }
}

module.exports = Message;
