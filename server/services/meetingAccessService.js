export function hasMeetingAccess(req, meeting) {
  return req.user.role === 'admin' || meeting.user_id.toString() === req.user._id.toString();
}
